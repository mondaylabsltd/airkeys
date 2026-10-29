//! The app driven through its real interface (`AirkeysCore`, the object the shells hold), by a
//! simulated shell: radios it can switch, and a camera that films Lumen Code frames and QR
//! codes rendered here. Codes the phone shows are read back with the reference scanner, so
//! each message makes the whole trip through Lumen Code.

use airkeys::app::ACCOUNTS;
use airkeys::ops::{Action, RadioState, Request};
use airkeys::runtime::{AirkeysCore, CameraFrame, Plane, Update};
use airkeys::view::{Language, NetworkKind, Screen, ViewModel, WordState};
use airkeys_wallet::protocol::Message;
use airkeys_wallet::{Mnemonic, Network, Wallet, bitcoin, evm};
use lumen::Renderer;
use lumen::scan::{Image, Scanner};
use lumen::transfer::{Finish, Receiver, Sender, prepare};
use std::sync::Arc;

const PHRASE: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

struct Shell {
    core: Arc<AirkeysCore>,
    camera: bool,
    private: bool,
    awake: bool,
    view: ViewModel,
}

const OFF: RadioState = RadioState::Off;

impl Shell {
    /// A phone with every radio off.
    fn new() -> Shell {
        let core = AirkeysCore::new();
        let view = core.view();
        let mut s = Shell { core, camera: false, private: false, awake: false, view };
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: OFF });
        s
    }

    fn act(&mut self, a: Action) -> &Screen {
        let u = self.core.dispatch(a);
        self.perform(u);
        &self.view.screen
    }

    fn perform(&mut self, u: Update) {
        if u.view.rev >= self.view.rev {
            self.view = u.view;
        }
        for r in u.requests {
            match r {
                Request::Camera { on } => self.camera = on,
                Request::Private { on } => self.private = on,
                Request::KeepScreenOn { on } => self.awake = on,
                Request::Haptic { .. } => {}
            }
        }
    }

    /// Types `text` one character at a time, as a keyboard sends it, starting from the
    /// field's current text (which the core may have completed).
    fn type_in(&mut self, text: &str) {
        for c in text.chars() {
            let Screen::Import { phrase } = &self.view.screen else { panic!("{:?}", self.view.screen) };
            let next = format!("{}{c}", phrase.text);
            self.act(Action::PhraseInput { text: next });
        }
    }

    fn open(&mut self, phrase: &str, passphrase: &str) {
        self.act(Action::Begin);
        self.act(Action::PhraseInput { text: phrase.into() });
        assert!(matches!(self.act(Action::PhraseDone), Screen::Passphrase { .. }), "{:?}", self.view.screen);
        self.act(Action::PassphraseInput { passphrase: passphrase.into() });
        assert!(matches!(self.act(Action::Open), Screen::Home { .. }), "{:?}", self.view.screen);
    }

    /// Films a Lumen Code message shown by the web app until the phone has it.
    fn film(&mut self, json: &str) {
        let prepared = prepare(json.as_bytes(), "airkeys-sign.json", true);
        // as the web app shows it: 4 colours, 22 % parity
        let mut tx = Sender::new(&prepared, 1, 2, 60, 60, 0x5157, 0).unwrap();
        for _ in 0..60 {
            if !self.camera {
                return;
            }
            let frame = tx.next_frame();
            let r = Renderer::new(&tx.layout, tx.mode, 5, 3);
            let mut px = vec![0u32; r.width * r.height];
            r.draw(&frame.cells, &mut px);
            if let Some(u) = self.core.scan(camera_frame(&px, r.width, r.height)) {
                self.perform(u);
            }
        }
        panic!("the phone did not finish receiving");
    }

    /// Films a QR code holding `payload`.
    fn film_qr(&mut self, payload: &[u8]) {
        let code = qrcode::QrCode::new(payload).unwrap();
        let n = code.width();
        let (scale, quiet) = (8, 4);
        let side = (n + 2 * quiet) * scale;
        let colors = code.to_colors();
        let px: Vec<u32> = (0..side * side)
            .map(|i| {
                let (x, y) = ((i % side) / scale, (i / side) / scale);
                let inside = x >= quiet && y >= quiet && x < n + quiet && y < n + quiet;
                let dark = inside && colors[(y - quiet) * n + x - quiet] == qrcode::Color::Dark;
                if dark { 0xff10_1010 } else { 0xffff_ffff }
            })
            .collect();
        if let Some(u) = self.core.scan(camera_frame(&px, side, side)) {
            self.perform(u);
        }
    }

    /// Reads the code on the phone's screen with the reference scanner.
    fn read_code(&self) -> String {
        let mut scanner = Scanner::new();
        let mut rx = Receiver::new();
        for _ in 0..40 {
            let f = self.core.code_frame(1080, 1800).expect("a code is shown");
            // scale one pixel per cell up 6×, as a screen would show it
            let s = 6;
            let (w, h) = (f.width as usize * s, f.height as usize * s);
            let mut rgba = vec![0u8; w * h * 4];
            for y in 0..h {
                for x in 0..w {
                    let i = ((y / s) * f.width as usize + x / s) * 4;
                    rgba[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&f.rgba[i..i + 4]);
                }
            }
            let res = scanner.scan(&Image { width: w, height: h, rgba: &rgba }, None);
            for cw in res.codewords.iter().filter(|c| c.ok) {
                rx.push(cw.bytes.as_ref().unwrap());
            }
            if let Some(Finish::File { bytes, .. }) = rx.try_finish() {
                return String::from_utf8(bytes).unwrap();
            }
        }
        panic!("the phone's code could not be read");
    }
}

/// RGBA pixels centred in a 1280×720 grey camera frame, converted to Y′CbCr 4:2:0
/// (full-range BT.601) with separate U and V planes.
fn camera_frame(px: &[u32], pw: usize, ph: usize) -> CameraFrame {
    let (w, h) = (1280usize, 720usize);
    let (ox, oy) = ((w - pw.min(w)) / 2, (h - ph.min(h)) / 2);
    let rgb = |x: usize, y: usize| -> (f32, f32, f32) {
        if x >= ox && y >= oy && x - ox < pw && y - oy < ph {
            let p = px[(y - oy) * pw + (x - ox)];
            ((p & 255) as f32, (p >> 8 & 255) as f32, (p >> 16 & 255) as f32)
        } else {
            (128.0, 128.0, 128.0)
        }
    };
    let mut yp = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            let (r, g, b) = rgb(x, y);
            yp[y * w + x] = (0.299 * r + 0.587 * g + 0.114 * b).round() as u8;
        }
    }
    let (cw, ch) = (w / 2, h / 2);
    let (mut u, mut v) = (vec![0u8; cw * ch], vec![0u8; cw * ch]);
    for y in 0..ch {
        for x in 0..cw {
            let (r, g, b) = rgb(x * 2, y * 2);
            u[y * cw + x] = (128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b).round().clamp(0.0, 255.0) as u8;
            v[y * cw + x] = (128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b).round().clamp(0.0, 255.0) as u8;
        }
    }
    CameraFrame {
        width: w as u32,
        height: h as u32,
        y: Plane { data: yp, row_stride: w as u32, pixel_stride: 1 },
        u: Plane { data: u, row_stride: cw as u32, pixel_stride: 1 },
        v: Plane { data: v, row_stride: cw as u32, pixel_stride: 1 },
    }
}

fn wallet(phrase: &str, passphrase: &str) -> Wallet {
    Wallet::new(&Mnemonic::parse(phrase).unwrap().seed(passphrase).unwrap()).unwrap()
}

#[test]
fn nothing_works_until_every_radio_is_off() {
    let core = AirkeysCore::new();
    assert!(matches!(core.view().screen, Screen::Offline { .. }), "radios not yet reported count as on");
    let mut s = Shell::new();
    assert_eq!(s.view.screen, Screen::Welcome);
    let Screen::Offline { radios, wallet_open: false } =
        s.act(Action::Radios { wifi: OFF, bluetooth: RadioState::On, cellular: OFF, network: OFF }).clone()
    else {
        panic!("{:?}", s.view.screen)
    };
    assert_eq!(radios[1].name, "Bluetooth");
    assert_eq!(radios[1].state, RadioState::On);
    s.act(Action::Begin);
    assert!(matches!(s.view.screen, Screen::Offline { .. }), "actions wait for the phone to be offline");
    assert_eq!(
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: OFF }),
        &Screen::Welcome
    );
    s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: RadioState::Unknown, network: OFF });
    assert!(matches!(s.view.screen, Screen::Offline { .. }), "a radio that cannot be checked counts as on");
    // switched off, but observed working: a Wi-Fi scan, a cellular signal
    let Screen::Offline { radios, .. } = s
        .act(Action::Radios { wifi: RadioState::Active, bluetooth: OFF, cellular: OFF, network: OFF })
        .clone()
    else {
        panic!("{:?}", s.view.screen)
    };
    assert!(radios[0].detail.as_deref().unwrap().contains("scanning"), "{:?}", radios[0]);
    assert!(radios[1].detail.is_none(), "an off radio needs nothing done");
    // every radio off, but a network is still there (USB tethering, Ethernet, VPN)
    let Screen::Offline { radios, .. } =
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: RadioState::On }).clone()
    else {
        panic!("{:?}", s.view.screen)
    };
    assert_eq!(radios[3].name, "Network connection");
    assert_eq!(
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: OFF }),
        &Screen::Welcome
    );
}

#[test]
fn typing_completes_words_and_opens_the_wallet() {
    let mut s = Shell::new();
    s.act(Action::Begin);
    assert!(s.private, "the phrase screen blocks screenshots");
    // four letters and a space per word, the last left open: the core completes the rest
    let words: Vec<&str> = PHRASE.split(' ').collect();
    for (i, w) in words.iter().enumerate() {
        s.type_in(&w[..w.len().min(4)]);
        if i + 1 < words.len() {
            s.type_in(" ");
        }
    }
    let Screen::Import { phrase } = s.view.screen.clone() else { panic!() };
    assert_eq!(phrase.words.last().unwrap().state, WordState::Typing, "the last word is still open");
    assert_eq!(phrase.text, format!("{} abou", PHRASE.rsplit_once(' ').unwrap().0));
    // Continue expands the last word too
    assert!(matches!(s.act(Action::PhraseDone), Screen::Passphrase { .. }), "{:?}", s.view.screen);
    s.act(Action::PassphraseInput { passphrase: "".into() });
    let Screen::Home { index: 0, accounts, .. } = s.act(Action::Open).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(!s.private);
    let w = wallet(PHRASE, "");
    for row in &accounts {
        assert_eq!(row.address, w.address(row.network.into(), 0).unwrap());
    }
}

#[test]
fn a_word_fixed_in_the_middle_is_completed_too() {
    let mut s = Shell::new();
    s.act(Action::Begin);
    let typo = "abandon abandon abandon abandon abandon abandon abandon xyzw abandon abandon abandon about";
    s.act(Action::PhraseInput { text: typo.into() });
    // the word tapped in the grid is selected; typing replaces it, one keystroke at a time
    let before = typo.replace("xyzw", "");
    let mut text = before.clone();
    let at = before.find("  ").unwrap() + 1;
    for (k, c) in "aban ".chars().enumerate() {
        text.insert(at + k, c);
        let Screen::Import { phrase } = s.act(Action::PhraseInput { text: text.clone() }).clone() else {
            panic!()
        };
        text = phrase.text;
    }
    let Screen::Import { phrase } = s.view.screen.clone() else { panic!() };
    assert_eq!(phrase.text, PHRASE, "completed, one space between words");
    assert!(phrase.valid);
}

#[test]
fn a_seedqr_fills_the_phrase_for_checking() {
    let mut s = Shell::new();
    assert!(matches!(s.act(Action::Scan), Screen::Scan { .. }));
    assert!(s.camera && s.private);
    // something else first: refused, camera off until "try again"
    s.film_qr(b"https://example.com");
    let Screen::Scan { problem: Some(p), .. } = &s.view.screen else { panic!("{:?}", s.view.screen) };
    assert!(p.contains("does not hold a recovery phrase"));
    assert!(!s.camera);
    s.act(Action::Scan);
    assert!(s.camera);
    // a SeedQR: each word as its four-digit index
    s.film_qr(format!("{}0003", "0000".repeat(11)).as_bytes());
    let Screen::Import { phrase } = s.view.screen.clone() else { panic!("{:?}", s.view.screen) };
    assert_eq!(phrase.text.trim_end(), PHRASE);
    assert!(phrase.valid && !s.camera && s.private);
    // a CompactSeedQR (binary entropy) works the same way
    s.act(Action::Back);
    s.act(Action::Scan);
    s.film_qr(&[0xff; 32]);
    let Screen::Import { phrase } = s.view.screen.clone() else { panic!("{:?}", s.view.screen) };
    assert_eq!(phrase.words.len(), 24);
}

#[test]
fn a_passphrase_opens_another_wallet() {
    let mut s = Shell::new();
    s.act(Action::Begin);
    s.act(Action::PhraseInput { text: PHRASE.into() });
    s.act(Action::PhraseDone);
    let Screen::Passphrase { problem: Some(p), .. } =
        s.act(Action::PassphraseInput { passphrase: "pässword".into() }).clone()
    else {
        panic!("{:?}", s.view.screen)
    };
    assert!(p.contains("English keyboard"));
    s.act(Action::Open);
    assert!(matches!(s.view.screen, Screen::Passphrase { .. }), "a refused passphrase opens nothing");
    s.act(Action::PassphraseInput { passphrase: "TREZOR".into() });
    let Screen::Home { accounts, .. } = s.act(Action::Open).clone() else { panic!() };
    assert_eq!(accounts[1].address, "0x1930d009d71be5d487211a83E51b5973b90ee69b");
    // back from the passphrase keeps what was typed
    s.act(Action::Close);
    s.act(Action::Begin);
    s.act(Action::PhraseInput { text: PHRASE.into() });
    s.act(Action::PhraseDone);
    let Screen::Import { phrase } = s.act(Action::Back).clone() else { panic!() };
    assert_eq!(phrase.text.trim_end(), PHRASE);
    assert!(phrase.valid && phrase.words.iter().all(|w| w.state == WordState::Known));
}

#[test]
fn close_forgets_everything() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    assert_eq!(s.act(Action::Close), &Screen::Welcome);
    s.act(Action::Connect);
    assert_eq!(s.view.screen, Screen::Welcome, "nothing of the wallet is left");
    s.act(Action::Begin);
    let Screen::Import { phrase } = &s.view.screen else { panic!() };
    assert!(phrase.text.is_empty());
}

#[test]
fn a_radio_coming_on_pauses_everything() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Scan);
    assert!(s.camera && s.awake);
    let Screen::Offline { wallet_open: true, .. } =
        s.act(Action::Radios { wifi: RadioState::On, bluetooth: OFF, cellular: OFF, network: OFF }).clone()
    else {
        panic!("{:?}", s.view.screen)
    };
    assert!(!s.camera && !s.awake, "the camera stops while the phone is online");
    assert!(s.core.scan(camera_frame(&[0], 1, 1)).is_none(), "and nothing is read");
    assert!(matches!(
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: OFF }),
        Screen::Scan { .. }
    ));
    assert!(s.camera, "offline again: the scan resumes");
}

#[test]
fn connect_shows_addresses_only() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Account { index: 1 });
    s.act(Action::Connect);
    s.act(Action::ConnectScope { all: false });
    s.act(Action::ToggleNetwork { network: NetworkKind::Bitcoin });
    let Screen::Code { json, .. } = s.act(Action::ShowAccounts).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(s.awake);
    let read = s.read_code();
    assert_eq!(read, json, "the code carries exactly the JSON the screen shows");
    let Message::Accounts(accounts) = Message::parse(read.as_bytes()).unwrap() else { panic!() };
    let networks: Vec<Network> = accounts.iter().map(|a| a.network).collect();
    assert_eq!(networks, vec![Network::Evm], "Bitcoin was deselected");
    assert!(accounts.iter().all(|a| a.index == 1));
    assert_eq!(accounts[0].address, "0xEA373B5359e70C7fE76d048fdfe435f6b910Ccd8");
    assert!(matches!(s.act(Action::Done), Screen::Home { index: 1, .. }));
    assert!(s.core.code_frame(1080, 1800).is_none(), "leaving the code screen stops the code");
    assert!(!s.awake);
}

#[test]
fn connect_shows_the_page_of_100_accounts_the_wheel_is_on() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    let Screen::Connect { scopes, .. } = s.act(Action::Connect).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(scopes.iter().any(|c| c.all && c.selected), "all accounts is the default");
    let Screen::Code { json, caption, .. } = s.act(Action::ShowAccounts).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(caption.starts_with("Accounts #0 to #99"), "{caption}");
    let started = std::time::Instant::now();
    let read = s.read_code();
    assert_eq!(read, json, "the camera reads back exactly the JSON on screen");
    let Message::Accounts(accounts) = Message::parse(read.as_bytes()).unwrap() else { panic!() };
    assert_eq!(accounts.len(), 200);
    let w = wallet(PHRASE, "");
    for (k, a) in accounts.iter().enumerate() {
        assert_eq!(a.index as usize, k / 2);
        assert_eq!(a.address, w.address(a.network, a.index).unwrap());
    }
    eprintln!("200 addresses read back from the code in {:?}", started.elapsed());

    // the wheel at #150: the page is #100 to #199
    s.act(Action::Done);
    s.act(Action::Account { index: 150 });
    let Screen::Connect { scopes, .. } = s.act(Action::Connect).clone() else {
        panic!("{:?}", s.view.screen)
    };
    let page = scopes.iter().find(|c| c.all).unwrap();
    assert_eq!(page.title, "Accounts #100 to #199");
    let Screen::Code { json, caption, .. } = s.act(Action::ShowAccounts).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(caption.starts_with("Accounts #100 to #199"), "{caption}");
    let Message::Accounts(accounts) = Message::parse(json.as_bytes()).unwrap() else { panic!() };
    assert_eq!(accounts.len(), 200);
    assert!(accounts.iter().all(|a| (100..200).contains(&a.index)));
    for a in &accounts {
        assert_eq!(a.address, w.address(a.network, a.index).unwrap());
    }
    // the last account the wheel offers, and its page
    s.act(Action::Done);
    s.act(Action::Account { index: ACCOUNTS - 1 });
    s.act(Action::Connect);
    let Screen::Code { caption, .. } = s.act(Action::ShowAccounts).clone() else { panic!() };
    assert!(caption.starts_with("Accounts #9900 to #9999"), "{caption}");
    // past it, the wheel does not move
    s.act(Action::Done);
    assert!(matches!(s.act(Action::Account { index: ACCOUNTS }), Screen::Home { index: 9999, .. }));
}

#[test]
fn the_code_fills_its_area() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Connect);
    s.act(Action::ConnectScope { all: false });
    s.act(Action::ShowAccounts);
    // one account: the largest cells, 44 across (a 2-cell quiet zone each side), and as tall
    // as a phone's code area allows
    let f = s.core.code_frame(1080, 1800).unwrap();
    assert_eq!((f.width, f.height), (48, 80));
    // a wide area: a wide code, the same cells
    let f = s.core.code_frame(1800, 1080).unwrap();
    assert_eq!((f.width, f.height), (80, 48));
    // never longer than 2.4 to 1
    let f = s.core.code_frame(1000, 9000).unwrap();
    assert_eq!((f.width, f.height), (48, 109));
    s.act(Action::Back);
    s.act(Action::Back);
    s.act(Action::Connect);
    s.act(Action::ConnectScope { all: true });
    s.act(Action::ShowAccounts);
    // all 100 accounts (about 9 KB) take smaller cells, 60 across, and more frames
    let f = s.core.code_frame(1080, 1800).unwrap();
    assert_eq!((f.width, f.height), (64, 106));
}

#[test]
fn the_wheel_offers_accounts_0_to_9999() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    assert_eq!(airkeys::runtime::account_count(), 10_000);
    let Screen::Home { index: 150, accounts, page } = s.act(Action::Account { index: 150 }).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(accounts.iter().all(|a| a.index == 150 && a.path.ends_with("/150'")));
    // the wheel shows the page that holds it, a hundred numbers
    assert_eq!((page.first, page.last, page.label.as_str()), (100, 199, "#100 – #199"));
    assert!(page.previous && page.next);
    // turning the page: its first account
    let Screen::Home { index: 200, .. } = s.act(Action::Page { next: true }).clone() else {
        panic!("{:?}", s.view.screen)
    };
    let Screen::Home { index: 100, .. } = s.act(Action::Page { next: false }).clone() else {
        panic!("{:?}", s.view.screen)
    };
    s.act(Action::Page { next: false });
    let Screen::Home { index: 0, page, .. } = s.act(Action::Page { next: false }).clone() else {
        panic!("{:?}", s.view.screen)
    };
    assert!(!page.previous, "no page before the first");
    let Screen::Home { page, .. } = s.act(Action::Account { index: 9999 }).clone() else { panic!() };
    assert_eq!((page.first, page.next), (9900, false));
    let Screen::Home { index: 9900, .. } = s.act(Action::Page { next: true }).clone() else {
        panic!("{:?}", s.view.screen)
    };
    s.act(Action::Account { index: 150 });
    assert!(
        matches!(s.act(Action::Account { index: 10_000 }), Screen::Home { index: 150, .. }),
        "past the wheel: ignored"
    );
}

fn evm_request() -> String {
    r#"{"airkeys":1,"type":"sign","id":"flow-1","network":"evm","chainId":8453,"from":{"index":0,"address":"0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158"},"txs":[{"to":{"address":"0x000000000000000000000000000000000000dEaD"},"amount":"25000000","token":{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","symbol":"USDC","decimals":6},"nonce":4,"gas":90000,"maxFeePerGas":"2000000000","maxPriorityFeePerGas":"1000000"},{"to":{"index":1},"amount":"300000000000000000","nonce":5,"gas":21000,"maxFeePerGas":"2000000000","maxPriorityFeePerGas":"2000000000"}]}"#.to_string()
}

#[test]
fn scan_review_sign_show() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    let Screen::Scan { title, .. } = s.act(Action::Scan).clone() else { panic!() };
    assert_eq!(title, "Scan request");
    assert!(s.camera && !s.private);
    let request = evm_request();
    s.film(&request);
    assert!(!s.camera, "the camera turns off once the request is in");
    let Screen::Review { review } = s.view.screen.clone() else { panic!("{:?}", s.view.screen) };
    assert_eq!(review.chain, "Base");
    assert_eq!(review.transfers.len(), 2);
    let t = &review.transfers;
    assert_eq!((t[0].amount.as_str(), t[0].asset.as_str(), t[0].verified), ("25", "USDC", true));
    assert_eq!((t[1].amount.as_str(), t[1].own_index), ("0.3", Some(1)));
    assert_eq!(review.fee, "≤ 0.000222 ETH");
    assert_eq!(review.hold_label, "Hold to sign 2 transactions");
    assert_eq!(review.transfers[1].label.as_deref(), Some("2 of 2"));
    assert!(review.warnings.is_empty());
    assert!(review.notices[0].contains("reveals the public key of EVM account #0"));

    let Screen::Code { json, .. } = s.act(Action::Sign).clone() else { panic!("{:?}", s.view.screen) };
    let read = s.read_code();
    assert_eq!(read, json);
    // the same request signed by the wallet library directly
    let Message::Sign(r) = Message::parse(request.as_bytes()).unwrap() else { panic!() };
    let w = wallet(PHRASE, "");
    let direct = airkeys_wallet::review(&r, &w).unwrap().sign(&w).unwrap();
    assert_eq!(Message::parse(read.as_bytes()).unwrap(), Message::Signed(direct));
    assert!(matches!(s.act(Action::Done), Screen::Home { .. }));
}

#[test]
fn refuses_a_request_for_another_wallet() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Scan);
    s.film(
        &evm_request().replace(
            "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158",
            "0xEA373B5359e70C7fE76d048fdfe435f6b910Ccd8",
        ),
    );
    let Screen::Refused { title, message } = &s.view.screen else { panic!("{:?}", s.view.screen) };
    assert_eq!(title, "Airkeys will not sign this");
    assert!(message.contains("another wallet"));
    // an accounts message is not a request
    s.act(Action::Done);
    s.act(Action::Scan);
    s.film(r#"{"airkeys":1,"type":"accounts","accounts":[{"network":"evm","index":0,"address":"0x00"}]}"#);
    assert!(matches!(&s.view.screen, Screen::Refused { title, .. } if title == "This is not a request"));
}

// ---------------------------------------------------------------- languages

/// Whether `s` has a Chinese character in it.
fn chinese(s: &str) -> bool {
    s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// Switches to Chinese and back, checking that each screen is the same screen in the other
/// language, and that English comes back exactly. Returns the Chinese view.
fn in_chinese(s: &mut Shell) -> ViewModel {
    let english = s.view.clone();
    assert_eq!(english.language, Language::En);
    s.act(Action::Language { language: Language::Zh });
    let zh = s.view.clone();
    assert_eq!(zh.language, Language::Zh);
    assert_eq!(
        std::mem::discriminant(&zh.screen),
        std::mem::discriminant(&english.screen),
        "the same screen"
    );
    s.act(Action::Language { language: Language::En });
    assert_eq!(
        (&s.view.screen, &s.view.toast),
        (&english.screen, &english.toast),
        "English again, unchanged"
    );
    s.act(Action::Language { language: Language::Zh });
    assert_eq!(s.view.screen, zh.screen, "Chinese again, unchanged");
    zh
}

#[test]
fn the_offline_check_and_the_start_speak_chinese() {
    let mut s = Shell::new();
    assert_eq!(s.view.language, Language::En, "English until the shell says otherwise");
    assert_eq!(in_chinese(&mut s).screen, Screen::Welcome, "the welcome screen's words are the shell's");
    // heard while the phone is online, too: the offline check is drawn again
    s.act(Action::Language { language: Language::En });
    s.act(Action::Radios {
        wifi: RadioState::Active,
        bluetooth: RadioState::On,
        cellular: OFF,
        network: OFF,
    });
    let Screen::Offline { radios, .. } = in_chinese(&mut s).screen else { panic!("{:?}", s.view.screen) };
    assert_eq!(radios[1].name, "蓝牙");
    assert_eq!(radios[1].detail.as_deref(), Some("关闭蓝牙。"));
    assert!(radios[0].detail.as_deref().unwrap().contains("Wi-Fi 扫描"), "{:?}", radios[0]);
    assert_eq!(radios[3].name, "网络连接");
    s.act(Action::Language { language: Language::En });
    let Screen::Offline { radios, .. } = &s.view.screen else { panic!() };
    assert_eq!(radios[1].name, "Bluetooth");
    // nothing but the words changed: the phone is still online, and offline it is the start
    s.act(Action::Language { language: Language::Zh });
    assert_eq!(
        s.act(Action::Radios { wifi: OFF, bluetooth: OFF, cellular: OFF, network: OFF }),
        &Screen::Welcome
    );
}

#[test]
fn the_phrase_and_the_passphrase_speak_chinese() {
    let mut s = Shell::new();
    s.act(Action::Language { language: Language::Zh });
    s.act(Action::Begin);
    s.act(Action::PhraseInput { text: "abandon xyzw abandon ".into() });
    let Screen::Import { phrase } = &s.view.screen else { panic!() };
    assert_eq!(phrase.problem.as_deref(), Some("第 2 个词不在 BIP-39 词表中。"));
    // a refusal kept as a toast follows the language too
    s.act(Action::PhraseDone);
    assert!(chinese(s.view.toast.as_deref().unwrap()), "{:?}", s.view.toast);
    s.act(Action::Language { language: Language::En });
    assert!(s.view.toast.as_deref().unwrap().starts_with("Word 2 is not"), "{:?}", s.view.toast);
    s.act(Action::DismissToast);
    s.act(Action::PhraseInput { text: PHRASE.into() });
    s.act(Action::PhraseDone);
    s.act(Action::PassphraseInput { passphrase: "pässword".into() });
    let Screen::Passphrase { problem: Some(p), .. } = in_chinese(&mut s).screen else { panic!() };
    assert!(p.contains("密码短语") && p.contains("英文键盘"), "{p}");
}

#[test]
fn a_review_speaks_chinese() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Scan);
    let Screen::Scan { title, hint, .. } = in_chinese(&mut s).screen else { panic!() };
    assert_eq!(title, "扫描请求");
    assert!(hint.contains("网页助手"), "{hint}");
    s.act(Action::Language { language: Language::En });
    assert!(s.camera, "the scan goes on in either language");
    // an unlisted token: a warning; two transactions: a count on the button
    s.film(
        &evm_request().replace(
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "0x1111111111111111111111111111111111111111",
        ),
    );
    let Screen::Review { review: en } = s.view.screen.clone() else { panic!("{:?}", s.view.screen) };
    assert!(en.warnings[0].contains("is not in Airkeys' token list"), "{:?}", en.warnings);
    let Screen::Review { review: zh } = in_chinese(&mut s).screen else { panic!() };
    assert!(zh.warnings[0].contains("不在 Airkeys 的代币列表中"), "{:?}", zh.warnings);
    assert!(zh.notices[0].contains("EVM 账户 #0 的公钥"), "{:?}", zh.notices);
    assert_eq!(zh.hold_label, "按住签名 2 笔交易");
    assert_eq!(zh.transfers[1].label.as_deref(), Some("第 2 笔，共 2 笔"));
    assert!(zh.details.iter().any(|d| d.label == "每 gas 最高费用"), "{:?}", zh.details);
    // the request itself is untouched: what is signed does not depend on the language
    assert_eq!(
        (zh.fee, zh.transfers[0].to.clone(), zh.transfers[0].amount.clone()),
        (en.fee, en.transfers[0].to.clone(), en.transfers[0].amount.clone())
    );
    let Screen::Code { title, caption, json, .. } = s.act(Action::Sign).clone() else { panic!() };
    assert_eq!(title, "已签名");
    assert!(caption.contains("全部 2 笔交易"), "{caption}");
    s.act(Action::Language { language: Language::En });
    let Screen::Code { title, json: en_json, .. } = s.view.screen.clone() else { panic!() };
    assert_eq!((title.as_str(), en_json), ("Signed", json), "the same code, in either language");
}

#[test]
fn a_refusal_speaks_chinese() {
    let mut s = Shell::new();
    s.open(PHRASE, "");
    s.act(Action::Scan);
    s.film(
        &evm_request().replace(
            "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158",
            "0xEA373B5359e70C7fE76d048fdfe435f6b910Ccd8",
        ),
    );
    let Screen::Refused { title, message } = in_chinese(&mut s).screen else { panic!("{:?}", s.view.screen) };
    assert_eq!(title, "Airkeys 拒绝签名");
    assert!(message.contains("另一个钱包") && message.contains("助记词和密码短语"), "{message}");
    s.act(Action::Language { language: Language::En });
    let Screen::Refused { title, message } = &s.view.screen else { panic!() };
    assert_eq!(title, "Airkeys will not sign this");
    assert!(message.contains("another wallet"));
    // a message the phone sent itself
    s.act(Action::Language { language: Language::Zh });
    s.act(Action::Done);
    s.act(Action::Scan);
    s.film(r#"{"airkeys":1,"type":"accounts","accounts":[{"network":"evm","index":0,"address":"0x00"}]}"#);
    let Screen::Refused { title, message } = &s.view.screen else { panic!() };
    assert_eq!(title, "这不是请求");
    assert!(message.contains("“accounts”"), "{message}");
}

/// What a hostile or broken web app can send, and what a person can type or scan: every
/// refusal comes with its Chinese sentence.
#[test]
fn every_wallet_refusal_has_a_chinese_sentence() {
    let w = wallet(PHRASE, "");
    let btc0 = w.address(Network::Bitcoin, 0).unwrap();
    let evm0 = w.address(Network::Evm, 0).unwrap();
    let (mut errors, mut taken) = (Vec::new(), Vec::new());
    let mut refuse = |json: String| match Message::parse(json.as_bytes()) {
        Err(e) => errors.push(e),
        Ok(Message::Sign(r)) => match airkeys_wallet::review(&r, &w) {
            Err(e) => errors.push(e),
            Ok(_) => taken.push(json),
        },
        Ok(_) => taken.push(json),
    };

    // the message
    for json in [
        "not json".to_string(),
        r#"{"airkeys":2,"type":"sign"}"#.into(),
        r#"{"airkeys":1}"#.into(),
        r#"{"airkeys":1,"type":"hello"}"#.into(),
        r#"{"airkeys":1,"type":"accounts","accounts":[]}"#.into(),
        r#"{"airkeys":1,"type":"accounts","accounts":[{"network":"evm","index":0,"address":"0x0"}],"x":1}"#
            .into(),
        r#"{"airkeys":1,"type":"sign","id":"no spaces allowed","network":"evm"}"#.into(),
        r#"{"airkeys":1,"type":"sign","id":"x","network":"solana"}"#.into(),
        r#"{"airkeys":1,"type":"sign","id":"x","network":"evm","from":{"index":0,"address":"0x0"}}"#.into(),
        format!(r#"{{"airkeys":1,"type":"accounts","pad":"{}"}}"#, "x".repeat(1 << 20)),
    ] {
        refuse(json);
    }

    // EVM requests: one transaction, one field changed
    let evm = |tx: &str, chain: u64, from: &str| {
        format!(
            r#"{{"airkeys":1,"type":"sign","id":"x","network":"evm","chainId":{chain},"from":{{"index":0,"address":"{from}"}},"txs":[{tx}]}}"#
        )
    };
    let tx = |fields: &str| {
        let base = r#""to":{"address":"0x000000000000000000000000000000000000dEaD"},"amount":"1","nonce":0,"gas":21000,"maxFeePerGas":"2000000000","maxPriorityFeePerGas":"1000000""#;
        let mut v: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&format!("{{{base}}}")).unwrap();
        let change: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&format!("{{{fields}}}")).unwrap();
        for (k, x) in change {
            if x.is_null() {
                v.remove(&k);
            } else {
                v.insert(k, x);
            }
        }
        serde_json::Value::Object(v).to_string()
    };
    let foreign = "0xEA373B5359e70C7fE76d048fdfe435f6b910Ccd8";
    for (fields, from) in [
        ("", foreign),
        (r#""amount":"0""#, &*evm0),
        (r#""to":{}"#, &evm0),
        (r#""to":{"index":0}"#, &evm0),
        (&format!(r#""to":{{"address":"{}"}}"#, evm0.to_lowercase()), &evm0),
        (r#""to":{"index":2147483648}"#, &evm0),
        (r#""to":{"index":1,"address":"0x000000000000000000000000000000000000dEaD"}"#, &evm0),
        (r#""to":{"address":"0x12"}"#, &evm0),
        (r#""to":{"address":"0x000000000000000000000000000000000000DeAd"}"#, &evm0),
        (r#""gas":20999"#, &evm0),
        (r#""maxPriorityFeePerGas":"3000000000""#, &evm0),
        (r#""maxPriorityFeePerGas":null"#, &evm0),
        (
            r#""maxFeePerGas":null,"maxPriorityFeePerGas":null,"gasPrice":"340282366920938463463374607431768211456""#,
            &evm0,
        ),
        (r#""maxFeePerGas":"340282366920938463463374607431768211456""#, &evm0),
        (r#""amount":"340282366920938463463374607431768211456""#, &evm0),
        (
            r#""maxFeePerGas":"340282366920938463463374607431768211455","maxPriorityFeePerGas":"1","gas":21000"#,
            &evm0,
        ),
        (r#""amount":"01""#, &evm0),
        (r#""amount":"1e18""#, &evm0),
        (&format!(r#""amount":"{}""#, "9".repeat(80)), &evm0),
        (
            r#""token":{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","symbol":"USD C","decimals":6}"#,
            &evm0,
        ),
        (
            r#""token":{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","symbol":"USDC","decimals":37}"#,
            &evm0,
        ),
        (
            r#""token":{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","symbol":"USDT","decimals":6}"#,
            &evm0,
        ),
        (r#""token":{"address":"0x12","symbol":"USDC","decimals":6}"#, &evm0),
    ] {
        refuse(evm(&tx(fields), 8453, from));
    }
    let from = &evm0;
    refuse(evm(&format!("{},{}", tx(""), tx(r#""nonce":2"#)), 8453, from));
    refuse(evm(&vec![tx(""); 17].join(","), 8453, from));
    refuse(evm(
        &format!(
            "{},{}",
            tx(
                r#""maxFeePerGas":"340282366920938463463374607431768211455","maxPriorityFeePerGas":"1","gas":1"#
            ),
            tx(r#""nonce":1"#)
        ),
        1,
        from,
    ));
    refuse(format!(
        r#"{{"airkeys":1,"type":"sign","id":"x","network":"evm","chainId":1,"from":{{"index":2147483648,"address":"{from}"}},"txs":[{}]}}"#,
        tx("")
    ));

    // Bitcoin requests: one coin of account #0, its outputs changed
    let script = bitcoin::parse_address(&btc0).unwrap().script;
    let prev = |value: u64, script: &[u8]| {
        let mut t = vec![2, 0, 0, 0, 1];
        t.extend_from_slice(&[7; 32]);
        t.extend_from_slice(&[0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 1]);
        t.extend_from_slice(&value.to_le_bytes());
        t.push(script.len() as u8);
        t.extend_from_slice(script);
        t.extend_from_slice(&[0; 4]);
        let id = bitcoin::txid_hex(&bitcoin::parse_tx(&t).unwrap().txid);
        (t.iter().map(|b| format!("{b:02x}")).collect::<String>(), id)
    };
    let (raw, txid) = prev(100_000, &script);
    let btc = |inputs: String, outputs: &str| {
        format!(
            r#"{{"airkeys":1,"type":"sign","id":"x","network":"bitcoin","from":{{"index":0,"address":"{btc0}"}},"inputs":[{inputs}],"outputs":[{outputs}]}}"#
        )
    };
    let input = |txid: &str, vout: u32, amount: u64, raw: &str| {
        format!(r#"{{"txid":"{txid}","vout":{vout},"amount":"{amount}","prevTx":"{raw}"}}"#)
    };
    let one = input(&txid, 0, 100_000, &raw);
    let pay =
        |address: &str, amount: u64| format!(r#"{{"to":{{"address":"{address}"}},"amount":"{amount}"}}"#);
    let foreign_btc = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    let (other_raw, other_txid) = prev(100_000, &bitcoin::parse_address(foreign_btc).unwrap().script);
    for (inputs, outputs) in [
        (String::new(), pay(foreign_btc, 1000)),
        (one.clone(), String::new()),
        (input("zz", 0, 100_000, &raw), pay(foreign_btc, 1000)),
        (input(&txid, 0, 100_000, "zz"), pay(foreign_btc, 1000)),
        (input(&txid, 0, 100_000, "0200"), pay(foreign_btc, 1000)),
        (input(&txid, 0, 100_000, &format!("{raw}00")), pay(foreign_btc, 1000)),
        (input(&txid, 0, 100_000, "0200000000"), pay(foreign_btc, 1000)),
        (input(&txid, 0, 100_000, "02000000ff"), pay(foreign_btc, 1000)),
        (input(&"ab".repeat(32), 0, 100_000, &raw), pay(foreign_btc, 1000)),
        (input(&txid, 1, 100_000, &raw), pay(foreign_btc, 1000)),
        (input(&txid, 0, 99_999, &raw), pay(foreign_btc, 1000)),
        (input(&other_txid, 0, 100_000, &other_raw), pay(foreign_btc, 1000)),
        (format!("{one},{one}"), pay(foreign_btc, 1000)),
        (one.clone(), pay(foreign_btc, 100)),
        (one.clone(), pay(foreign_btc, 100_000)),
        // the payer in another spelling (written as §3 writes it, it is change coming back)
        (one.clone(), pay(&btc0.to_uppercase(), 1000)),
        (one.clone(), pay("bc1qnotanaddress", 1000)),
        (one.clone(), pay("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", 1000)),
        (one.clone(), pay("bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs", 1000)),
        (one.clone(), pay("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3", 1000)),
        (one.clone(), pay("bc1\u{202e}q", 1000)),
        (one.clone(), pay(foreign_btc, u64::MAX).replace(&u64::MAX.to_string(), "18446744073709551616")),
        (one.clone(), format!("{},{}", pay(foreign_btc, u64::MAX), pay(foreign_btc, u64::MAX))),
    ] {
        refuse(btc(inputs, &outputs));
    }

    assert!(taken.is_empty(), "not refused: {taken:#?}");

    // what a person types or scans
    let mut more: Vec<airkeys_wallet::Error> = vec![
        Mnemonic::parse("abandon abandon xyzw").unwrap_err(),
        Mnemonic::parse("abandon abandon abandon").unwrap_err(),
        Mnemonic::parse(&"abandon ".repeat(12)).unwrap_err(),
        Mnemonic::from_qr(b"https://example.com").unwrap_err(),
        Mnemonic::from_qr(format!("{}2048", "0000".repeat(11)).as_bytes()).unwrap_err(),
        Mnemonic::from_entropy(&[0; 15]).unwrap_err(),
        airkeys_wallet::keys::check_passphrase(&"x".repeat(257)).unwrap_err(),
        airkeys_wallet::keys::check_passphrase("pässword").unwrap_err(),
        w.address(Network::Evm, airkeys_wallet::MAX_INDEX + 1).unwrap_err(),
        evm::parse_address("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD").unwrap_err(),
        airkeys_wallet::amount::Amount::parse("-1").unwrap_err(),
    ];
    errors.append(&mut more);

    for e in &errors {
        assert!(!e.en.is_empty() && !chinese(&e.en), "{e:?}");
        assert!(chinese(&e.zh), "no Chinese for: {}", e.en);
        assert_ne!(e.zh, e.en);
        eprintln!("{}\n  {}", e.en, e.zh);
    }
    assert!(errors.len() >= 70, "{} refusals", errors.len());
}
