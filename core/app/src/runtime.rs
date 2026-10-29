//! The runtime: the Crux core plus the work it asks of Rust, behind the interface the iOS and
//! Android shells call (uniffi).
//!
//! ```text
//!  shell ── dispatch(action) ──► core ──► Update { view, requests }
//!  camera thread ── scan(frame) ──► Lumen Code or QR reader ──► Update when something changed
//!  display link ── code_frame(area) ──► Lumen Code sender ──► the next frame's pixels
//! ```
//!
//! Every call answers synchronously: there are no callbacks into the shell and no threads
//! here. Requests are notifications — nothing is ever answered — so a shell performs the
//! requests of each update it gets, in order, and shows the view with the highest `rev`.

use crate::app::{Airkeys, Effect, Event};
use crate::ops::{Action, CodeOp, Request};
use crate::view::ViewModel;
use crux_core::Core;
use lumen::Renderer;
use lumen::scan::{Scanner, YuvImage};
use lumen::transfer::{Finish, Limits, Prepared, Receiver, Sender, prepare};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, MutexGuard};
use zeroize::Zeroize;

/// Frames per second of a code on the phone's screen. Laptop webcams film at 15–30 fps,
/// so each frame is captured at least once or twice.
pub const CODE_FPS: u32 = 10;
/// Four colours, 22 % parity: robust on poor webcams; a reply fits in a few frames anyway.
const CODE_MODE: usize = 1;
const CODE_ECC: usize = 2;
/// The quiet zone around the code, in cells.
const QUIET: usize = 2;
/// Messages are at most 1 MiB (PROTOCOL §2.6).
const MAX_RECEIVE: u64 = airkeys_wallet::protocol::MAX_MESSAGE as u64;

/// What an event led to: the new view, and the requests to perform.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct Update {
    pub view: ViewModel,
    /// To perform in order. None is answered.
    pub requests: Vec<Request>,
}

/// One plane of a camera image: sample (x, y) is `data[y · row_stride + x · pixel_stride]`.
#[derive(Clone, Debug, uniffi::Record)]
pub struct Plane {
    pub data: Vec<u8>,
    pub row_stride: u32,
    pub pixel_stride: u32,
}

/// A camera frame in Y′CbCr 4:2:0 (full range), as AVFoundation and CameraX deliver it.
/// iOS biplanar frames pass their interleaved chroma plane as `u` and again, one byte on,
/// as `v`.
#[derive(Clone, Debug, uniffi::Record)]
pub struct CameraFrame {
    pub width: u32,
    pub height: u32,
    pub y: Plane,
    pub u: Plane,
    pub v: Plane,
}

/// A code frame: one pixel per cell (RGBA, quiet zone included). Draw it scaled up with
/// nearest-neighbour filtering — never smoothed — on a dark background.
#[derive(Clone, Debug, uniffi::Record)]
pub struct CodeFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// The message on screen, and its code for the area last asked for.
struct CodeStream {
    prepared: Prepared,
    area: (u32, u32),
    code: Option<(Sender, Renderer)>,
}

enum Reader {
    Lumen { scanner: Box<Scanner>, receiver: Box<Receiver>, progress: (u32, u32) },
    Qr,
}

struct Reception {
    reader: Reader,
    y: Vec<u8>,
    cbcr: Vec<u8>,
}

/// The last camera image may show a SeedQR: it is wiped when reading stops.
impl Drop for Reception {
    fn drop(&mut self) {
        self.y.zeroize();
        self.cbcr.zeroize();
    }
}

/// The phone app's core, as the shells hold it: one per process, for as long as the app runs.
/// Every call is synchronous and may come from any thread.
#[derive(uniffi::Object)]
pub struct AirkeysCore {
    core: Mutex<Core<Airkeys>>,
    send: Mutex<Option<CodeStream>>,
    recv: Mutex<Option<Reception>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // a panic on another thread leaves plain data behind; carry on with it
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[uniffi::export]
impl AirkeysCore {
    /// A core with no wallet open, on the offline check.
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(AirkeysCore {
            core: Mutex::new(Core::new()),
            send: Mutex::new(None),
            recv: Mutex::new(None),
        })
    }

    /// Something the person did or that happened to the app.
    pub fn dispatch(&self, action: Action) -> Update {
        self.event(Event::Action(action))
    }

    /// The view to draw now.
    pub fn view(&self) -> ViewModel {
        lock(&self.core).view()
    }

    /// A camera frame, from any thread. Returns an update when it moved the reading on
    /// (progress, a complete message, a QR code); `None` otherwise. Frames that arrive while
    /// nothing is being read are ignored.
    pub fn scan(&self, frame: CameraFrame) -> Option<Update> {
        let event = {
            let mut recv = lock(&self.recv);
            let r = recv.as_mut()?;
            let event = r.scan(&frame)?;
            if matches!(event, Event::Received(_) | Event::QrScanned(_)) {
                *recv = None;
            }
            event
        };
        Some(self.event(event))
    }

    /// A complete message that arrived without the camera — automated device tests, where
    /// an emulator's camera cannot film a code. It takes the same path as a scanned one,
    /// review and confirmation included; the core takes it only on the request scan screen.
    pub fn deliver(&self, message: Vec<u8>) -> Update {
        *lock(&self.recv) = None;
        self.event(Event::Received(message))
    }

    /// The next frame of the code on screen, or `None` when none is shown. Call it
    /// [`code_fps`] times a second while the view shows a code, with the size of the area
    /// the code may fill (any unit: only its shape counts). The code takes that shape: on a
    /// phone, a tall code from the title to the buttons.
    pub fn code_frame(&self, width: u32, height: u32) -> Option<CodeFrame> {
        let mut send = lock(&self.send);
        let s = send.as_mut()?;
        let (sender, r) = s.shaped(width, height)?;
        let frame = sender.next_frame();
        let mut pixels = vec![r.ink; r.width * r.height];
        r.cell_pixels(&frame.cells, &mut pixels);
        Some(CodeFrame {
            width: r.width as u32,
            height: r.height as u32,
            rgba: pixels.iter().flat_map(|p| p.to_le_bytes()).collect(),
        })
    }
}

/// Frames per second at which to call `code_frame`.
#[uniffi::export]
pub fn code_fps() -> u32 {
    CODE_FPS
}

/// How many account numbers the phone offers: #0 to `account_count() - 1`, a page of 100 at a
/// time on the home screen's wheel (`Screen::Home.page`).
#[uniffi::export]
pub fn account_count() -> u32 {
    crate::app::ACCOUNTS
}

impl AirkeysCore {
    fn event(&self, event: Event) -> Update {
        let core = lock(&self.core);
        let effects = core.process_event(event);
        let requests = self.process(effects);
        Update { view: core.view(), requests }
    }

    /// Runs the camera-code operations here and returns what the shell must perform.
    fn process(&self, effects: Vec<Effect>) -> Vec<Request> {
        let mut queue: VecDeque<Effect> = effects.into();
        let mut requests = Vec::new();
        while let Some(effect) = queue.pop_front() {
            match effect {
                Effect::Render(_) => {}
                Effect::Platform(request) => requests.push(request.operation),
                Effect::Code(request) => self.code(request.operation),
            }
        }
        requests
    }

    fn code(&self, op: CodeOp) {
        match op {
            CodeOp::Show { name, data } => *lock(&self.send) = Some(CodeStream::new(&name, &data)),
            CodeOp::Hide => *lock(&self.send) = None,
            CodeOp::Listen => *lock(&self.recv) = Some(Reception::new(Reader::lumen())),
            CodeOp::ListenQr => *lock(&self.recv) = Some(Reception::new(Reader::Qr)),
            CodeOp::Stop => *lock(&self.recv) = None,
        }
    }
}

/// A transfer id that differs between transfers (it need not be secret).
fn transfer_id() -> u16 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos()),
    );
    h.finish() as u16
}

/// Cells across the short side of the code, from large cells to small: the first that lets a
/// reader read the message within [`READ_FRAMES`] frames is shown. A webcam across a desk
/// reads large cells best (in a simulated 720p webcam, these read from a code 260 px wide in
/// its image, 44 even from 200 px); a larger message (all 100 accounts: about 9 KB) keeps the
/// last of them and takes more frames.
const SHORT_SIDES: [usize; 3] = [44, 52, 60];
const READ_FRAMES: usize = 4;
/// Lumen's limit on a code's shape, long side to short.
const MAX_ASPECT: f64 = 2.4;

/// The grid (cells across, down) for a payload in an area of the screen: as tall or as wide
/// as the area, quiet zone included, and the largest cells that read fast.
fn grid(prepared: &Prepared, width: u32, height: u32) -> (usize, usize) {
    let (short, long) = (width.min(height).max(1) as f64, width.max(height).max(1) as f64);
    let aspect = (long / short).min(MAX_ASPECT);
    let shape = |side: usize| {
        let q = 2 * QUIET;
        let along = (((side + q) as f64 * aspect).floor() as usize).saturating_sub(q);
        let along = along.clamp(side, (side as f64 * MAX_ASPECT) as usize);
        if width > height { (along, side) } else { (side, along) }
    };
    SHORT_SIDES
        .into_iter()
        .map(shape)
        .find(|&(x, y)| frames_to_read(prepared, x, y) <= READ_FRAMES)
        .unwrap_or_else(|| shape(SHORT_SIDES[SHORT_SIDES.len() - 1]))
}

/// The frames a reader that catches every one needs: the sender's own schedule played into a
/// receiver. `usize::MAX` past `READ_FRAMES`.
fn frames_to_read(prepared: &Prepared, x: usize, y: usize) -> usize {
    let Some(mut sender) = Sender::new(prepared, CODE_MODE, CODE_ECC, x, y, 0, 0) else {
        return usize::MAX;
    };
    let mut receiver = Receiver::new();
    for n in 1..=READ_FRAMES {
        for packet in sender.next_packets() {
            receiver.push(&packet);
        }
        if receiver.try_finish().is_some() {
            return n;
        }
    }
    usize::MAX
}

impl CodeStream {
    fn new(name: &str, data: &[u8]) -> CodeStream {
        CodeStream { prepared: prepare(data, name, true), area: (0, 0), code: None }
    }

    /// The code for an area: made again, as a new transfer, when the area changes its grid.
    fn shaped(&mut self, width: u32, height: u32) -> Option<(&mut Sender, &Renderer)> {
        if self.code.is_none() || self.area != (width, height) {
            self.area = (width, height);
            let (x, y) = grid(&self.prepared, width, height);
            if self.code.as_ref().is_none_or(|(s, _)| (s.layout.x, s.layout.y) != (x, y)) {
                let sender = Sender::new(&self.prepared, CODE_MODE, CODE_ECC, x, y, transfer_id(), 0)?;
                let renderer = Renderer::new(&sender.layout, sender.mode, 1, QUIET);
                self.code = Some((sender, renderer));
            }
        }
        self.code.as_mut().map(|(s, r)| (s, &*r))
    }
}

impl Reader {
    fn lumen() -> Reader {
        let receiver = Receiver::with_limits(Limits { max_size: MAX_RECEIVE, ..Limits::default() });
        Reader::Lumen { scanner: Box::new(Scanner::new()), receiver: Box::new(receiver), progress: (0, 0) }
    }
}

impl Reception {
    fn new(reader: Reader) -> Reception {
        Reception { reader, y: Vec::new(), cbcr: Vec::new() }
    }

    /// Copies the frame into the tightly packed layout the scanner reads; `false` when the
    /// planes are smaller than their stated size.
    fn pack(&mut self, f: &CameraFrame) -> bool {
        let (w, h) = (f.width as usize, f.height as usize);
        let (cw, ch) = (w.div_ceil(2), h.div_ceil(2));
        let ys = f.y.row_stride as usize;
        // sizes come from the platform: checked, so a strange frame cannot overflow (armv7)
        let y_end = (h - 1).checked_mul(ys).and_then(|n| n.checked_add(w));
        if w < 16 || h < 16 || ys < w || y_end.is_none_or(|end| f.y.data.len() < end) {
            return false;
        }
        let fits = |p: &Plane| {
            (ch - 1)
                .checked_mul(p.row_stride as usize)
                .zip((cw - 1).checked_mul(p.pixel_stride as usize))
                .and_then(|(a, b)| a.checked_add(b))
                .is_some_and(|last| last < p.data.len())
        };
        if !fits(&f.u) || !fits(&f.v) {
            return false;
        }
        self.y.clear();
        for row in 0..h {
            self.y.extend_from_slice(&f.y.data[row * ys..row * ys + w]);
        }
        self.cbcr.clear();
        self.cbcr.reserve(cw * ch * 2);
        let (ur, up, vr, vp) = (
            f.u.row_stride as usize,
            f.u.pixel_stride as usize,
            f.v.row_stride as usize,
            f.v.pixel_stride as usize,
        );
        for row in 0..ch {
            for col in 0..cw {
                self.cbcr.push(f.u.data[row * ur + col * up]);
                self.cbcr.push(f.v.data[row * vr + col * vp]);
            }
        }
        true
    }

    fn scan(&mut self, frame: &CameraFrame) -> Option<Event> {
        if !self.pack(frame) {
            return None;
        }
        let (w, h) = (frame.width as usize, frame.height as usize);
        match &mut self.reader {
            Reader::Qr => {
                let y = &self.y;
                let mut img = rqrr::PreparedImage::prepare_from_greyscale(w, h, |x, yy| y[yy * w + x]);
                for grid in img.detect_grids() {
                    let mut payload = Vec::new();
                    if grid.decode_to(&mut payload).is_ok() {
                        return Some(Event::QrScanned(payload));
                    }
                }
                None
            }
            Reader::Lumen { scanner, receiver, progress } => {
                let img = YuvImage { width: w, height: h, y: &self.y, cbcr: &self.cbcr };
                let result = scanner.scan_yuv(&img, None, None);
                if !result.ok {
                    return None;
                }
                for cw in result.codewords.iter().filter(|c| c.ok) {
                    if let Some(bytes) = &cw.bytes {
                        receiver.push(bytes);
                    }
                }
                if let Some(Finish::File { bytes, .. }) = receiver.try_finish() {
                    return Some(Event::Received(bytes));
                }
                let p = receiver.progress()?;
                let now = (p.received, p.needed.unwrap_or(0));
                if now == *progress {
                    return None;
                }
                *progress = now;
                Some(Event::Progress { received: now.0, needed: now.1 })
            }
        }
    }
}
