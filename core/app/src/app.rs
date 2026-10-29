//! The Airkeys phone app as one Crux state machine.
//!
//! Everything here **decides**; nothing here **does**. An [`Event`] updates the [`Model`] and
//! returns commands: render, a [`Request`] for the platform (camera, screen), or a [`CodeOp`]
//! for the Rust runtime (Lumen Code, QR codes). No clock, no I/O, no threads — so every flow
//! is tested in microseconds and behaves the same on iOS and Android.
//!
//! Airkeys keeps nothing. The person brings their recovery phrase each session — typed or
//! from a SeedQR — and it lives in memory until they close the wallet or the app is closed.
//! Nothing creates a phrase here, and nothing is written anywhere.
//!
//! What the platform does follows from the screen alone: `Model::reconcile` compares what
//! the current phase needs (camera, screen kept on, screenshots blocked, a code playing, a
//! receiver listening) with what was last asked for, and asks for the difference. No path
//! can leave the camera on or a phrase unprotected.
//!
//! Every word the person reads comes in English and Simplified Chinese, side by side where it
//! is written: `text!("English", "中文")` keeps both until the view picks the one of
//! [`Language`], so changing the language draws the same screen again in the other.

use crate::ops::{Action, CodeOp, Haptic, RadioState, Request};
use crate::view::*;
use airkeys_wallet::keys::{check_passphrase, completions, word_index};
use airkeys_wallet::protocol::{Account, Message};
use airkeys_wallet::{Mnemonic, Network, Review, Text, Wallet, review, text};
use crux_core::macros::effect;
use crux_core::render::{RenderOperation, render};
use crux_core::{App, Command};
use std::ops::Range;
use zeroize::{Zeroize, Zeroizing};

/// What the app asks of the world: a new view, something of the platform, camera-code work.
#[effect]
pub enum Effect {
    Render(RenderOperation),
    Platform(Request),
    Code(CodeOp),
}

/// What happens to the app: a person's action, or the runtime's news.
pub enum Event {
    /// Something the person did (or the shell observed).
    Action(Action),
    /// A complete Lumen Code transfer (from the runtime).
    Received(Vec<u8>),
    /// Reception progress, in fountain symbols (from the runtime).
    Progress { received: u32, needed: u32 },
    /// The payload of a QR code (from the runtime).
    QrScanned(Vec<u8>),
}

/// Sizes, never contents: a QR code may hold a recovery phrase.
impl std::fmt::Debug for Event {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Event::Action(a) => f.debug_tuple("Action").field(a).finish(),
            Event::Received(b) => write!(f, "Received({} bytes)", b.len()),
            Event::Progress { received, needed } => write!(f, "Progress({received}/{needed})"),
            Event::QrScanned(b) => write!(f, "QrScanned({} bytes)", b.len()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Purpose {
    /// A recovery phrase QR code (SeedQR, CompactSeedQR, text).
    Phrase,
    /// A sign request from the web app (Lumen Code).
    Request,
}

enum Phase {
    Welcome,
    Import {
        text: Zeroizing<String>,
    },
    Passphrase {
        phrase: Mnemonic,
        typed: Zeroizing<String>,
        passphrase: Zeroizing<String>,
        problem: Option<Text>,
    },
    Home,
    Account {
        network: Network,
    },
    Connect {
        selected: [bool; 2],
        /// The page of `PAGE` accounts that holds the one on the home screen, or only that one.
        all: bool,
    },
    Code {
        title: Text,
        caption: Text,
        message: Message,
        json: String,
        back: Box<Phase>,
    },
    Scan {
        purpose: Purpose,
        progress: Option<(u32, u32)>,
        problem: Option<Text>,
        typed: Option<Zeroizing<String>>,
    },
    Review {
        review: Box<Review>,
    },
    Refused {
        title: Text,
        message: Text,
    },
}

/// What the platform has been asked to do, as the screen requires it.
#[derive(Clone, Default, PartialEq)]
struct Platform {
    camera: bool,
    awake: bool,
    private: bool,
    listening: Option<Purpose>,
    /// The JSON of the code on screen.
    showing: Option<String>,
}

/// Everything the app knows, in memory only; the open wallet among it.
pub struct Model {
    rev: u64,
    /// Wi-Fi, Bluetooth, mobile data and any network connection, as the shell last reported
    /// them.
    radios: [RadioState; 4],
    toast: Option<Text>,
    /// The language the view is drawn in.
    language: Language,
    phase: Phase,
    /// The open wallet; `None` whenever none is open.
    wallet: Option<Wallet>,
    /// The account number on the home screen.
    index: u32,
    platform: Platform,
}

impl Default for Model {
    fn default() -> Self {
        Model {
            rev: 0,
            radios: [RadioState::Unknown; 4],
            toast: None,
            language: Language::En,
            phase: Phase::Welcome,
            wallet: None,
            index: 0,
            platform: Platform::default(),
        }
    }
}

/// The Airkeys app, for Crux.
#[derive(Default)]
pub struct Airkeys;

type Cmd = Command<Effect, Event>;

fn notify(r: Request) -> Cmd {
    Command::notify_shell(r).build()
}

fn code(op: CodeOp) -> Cmd {
    Command::notify_shell(op).build()
}

fn haptic(kind: Haptic) -> Cmd {
    notify(Request::Haptic { kind })
}

/// English and Chinese.
type Words = (&'static str, &'static str);

/// The rows of the offline check: its name, what to do while one is on, and what "still
/// active" means.
const RADIOS: [(RadioKind, Words, Words, Words); 4] = [
    (
        RadioKind::Wifi,
        ("Wi-Fi", "Wi-Fi"),
        ("Switch Wi-Fi off.", "关闭 Wi-Fi。"),
        (
            "Switched off, but still scanning for networks to locate the phone. Turn off Wi-Fi scanning in Location settings, or turn Location off.",
            "已关闭，但仍在扫描网络来给手机定位。请在定位设置中关闭 Wi-Fi 扫描，或关闭定位。",
        ),
    ),
    (
        RadioKind::Bluetooth,
        ("Bluetooth", "蓝牙"),
        ("Switch Bluetooth off.", "关闭蓝牙。"),
        (
            "Switched off, but still active, usually for Bluetooth scanning. Turn that off in Location settings, or turn Location off.",
            "已关闭，但仍在工作，通常是在做蓝牙扫描。请在定位设置中关闭它，或关闭定位。",
        ),
    ),
    (
        RadioKind::MobileData,
        ("Mobile data", "移动数据"),
        ("Turn on Airplane mode.", "打开飞行模式。"),
        (
            "Airplane mode is on, but the phone still has a cellular signal.",
            "飞行模式已打开，但手机仍有蜂窝信号。",
        ),
    ),
    (
        RadioKind::Network,
        ("Network connection", "网络连接"),
        (
            "Disconnect every network: Wi-Fi, a cable, tethering, a VPN.",
            "断开所有网络：Wi-Fi、网线、网络共享、VPN。",
        ),
        (
            "The phone still has a network: tethering, USB, Ethernet or VPN. Disconnect it.",
            "手机仍连着网络：网络共享、USB、以太网或 VPN。请断开它。",
        ),
    ),
];

/// The account numbers the phone offers to show and connect: #0 to #99, one turn of the
/// home screen's wheel. Signing is not limited: a request names its own account.
pub const ACCOUNTS: u32 = 10_000;
/// Accounts shown to the web app at once: a page, #0–#99, #100–#199 and so on. One code carries
/// one page of both networks (200 accounts, the most an `accounts` message holds, PROTOCOL §4);
/// the page is the one the home screen's wheel is on.
pub const PAGE: u32 = 100;

/// The page that holds account `index`.
pub fn page_of(index: u32) -> std::ops::Range<u32> {
    let start = index / PAGE * PAGE;
    start..(start + PAGE).min(ACCOUNTS)
}

fn network_name(n: Network) -> Words {
    match n {
        Network::Bitcoin => ("Bitcoin", "Bitcoin"),
        Network::Evm => ("Ethereum & EVM", "Ethereum 和 EVM"),
    }
}

fn network_assets(n: Network) -> Words {
    match n {
        Network::Bitcoin => ("BTC", "BTC"),
        Network::Evm => ("ETH, ERC-20 tokens", "ETH、ERC-20 代币"),
    }
}

impl Model {
    /// Airkeys works only on a phone with every radio off.
    fn offline(&self) -> bool {
        self.radios.iter().all(|r| *r == RadioState::Off)
    }

    /// Forgets the wallet and anything typed: the next session starts from nothing.
    fn forget(&mut self) {
        self.wallet = None;
        self.index = 0;
        self.phase = Phase::Welcome;
    }

    /// What the current phase needs from the platform: nothing while the phone is online —
    /// except keeping screenshots blocked, which follows the phase alone, so no frame with a
    /// phrase on it is ever unprotected.
    fn wanted(&self) -> Platform {
        let private = matches!(
            self.phase,
            Phase::Import { .. } | Phase::Passphrase { .. } | Phase::Scan { purpose: Purpose::Phrase, .. }
        );
        if !self.offline() {
            return Platform { private, ..Platform::default() };
        }
        let (camera, listening) = match &self.phase {
            Phase::Scan { purpose, problem: None, .. } => (true, Some(*purpose)),
            _ => (false, None),
        };
        Platform {
            camera,
            awake: matches!(self.phase, Phase::Code { .. } | Phase::Scan { .. }),
            private,
            listening,
            showing: match &self.phase {
                Phase::Code { json, .. } => Some(json.clone()),
                _ => None,
            },
        }
    }

    /// Asks the platform for the difference between what the phase needs and what it has.
    fn reconcile(&mut self) -> Cmd {
        let want = self.wanted();
        let had = std::mem::replace(&mut self.platform, want.clone());
        let mut cmds = Vec::new();
        if want.listening != had.listening {
            cmds.push(code(match want.listening {
                Some(Purpose::Request) => CodeOp::Listen,
                Some(Purpose::Phrase) => CodeOp::ListenQr,
                None => CodeOp::Stop,
            }));
        }
        if want.camera != had.camera {
            cmds.push(notify(Request::Camera { on: want.camera }));
        }
        if want.awake != had.awake {
            cmds.push(notify(Request::KeepScreenOn { on: want.awake }));
        }
        if want.private != had.private {
            cmds.push(notify(Request::Private { on: want.private }));
        }
        if want.showing != had.showing {
            cmds.push(match (&want.showing, &self.phase) {
                (Some(json), Phase::Code { message, .. }) => {
                    code(CodeOp::Show { name: message.file_name(), data: json.clone().into_bytes() })
                }
                _ => code(CodeOp::Hide),
            });
        }
        Command::all(cmds)
    }
}

impl Airkeys {
    fn show_code(&self, model: &mut Model, title: Text, caption: Text, message: Message, back: Phase) {
        let json = message.to_json();
        model.phase = Phase::Code { title, caption, message, json, back: Box::new(back) };
    }

    /// Shows the accounts message for `networks` and account numbers `indexes`; Done returns
    /// to `back`.
    fn share(&self, model: &mut Model, networks: &[Network], indexes: Range<u32>, back: Phase) {
        let Some(wallet) = &model.wallet else { return };
        let mut accounts = Vec::new();
        for index in indexes.clone() {
            for &n in networks {
                match wallet.address(n, index) {
                    Ok(address) => accounts.push(Account { network: n, index, address }),
                    Err(e) => {
                        model.toast = Some(e.into());
                        return;
                    }
                }
            }
        }
        let (en, zh): (Vec<_>, Vec<_>) = networks.iter().map(|n| network_name(*n)).unzip();
        let which = match indexes.len() {
            1 => text!("Account #{}", "账户 #{}", indexes.start),
            _ => text!("Accounts #{} to #{}", "账户 #{} 到 #{}", indexes.start, indexes.end - 1),
        };
        let caption = Text {
            en: format!("{} · {} · addresses only", which.en, en.join(", ")),
            zh: format!("{} · {} · 仅地址", which.zh, zh.join("、")),
        };
        let title = text!("Show this to the web app", "给网页助手扫描");
        self.show_code(model, title, caption, Message::Accounts(accounts), back);
    }

    /// A Lumen Code transfer arrived while scanning for a request.
    fn received(&self, model: &mut Model, bytes: &[u8]) -> Cmd {
        let refuse = |model: &mut Model, title: Text, message: Text| {
            model.phase = Phase::Refused { title, message };
            haptic(Haptic::Error)
        };
        match Message::parse(bytes) {
            Err(e) => refuse(model, text!("Not an Airkeys request", "不是 Airkeys 请求"), e.into()),
            Ok(Message::Sign(request)) => match &model.wallet {
                None => Command::done(),
                Some(wallet) => match review(&request, wallet) {
                    Ok(r) => {
                        let warn = !r.warnings.is_empty();
                        model.phase = Phase::Review { review: Box::new(r) };
                        haptic(if warn { Haptic::Warning } else { Haptic::Success })
                    }
                    Err(e) => {
                        refuse(model, text!("Airkeys will not sign this", "Airkeys 拒绝签名"), e.into())
                    }
                },
            },
            Ok(m) => refuse(
                model,
                text!("This is not a request", "这不是请求"),
                text!(
                    "This code holds the phone's “{}” message. Scan the code on the web app's Send screen.",
                    "这个动态码里是手机的“{}”消息。请扫描网页助手“转出”页面上的动态码。",
                    m.type_name()
                ),
            ),
        }
    }

    /// A QR code arrived while scanning for a recovery phrase.
    fn qr(&self, model: &mut Model, payload: &[u8]) -> Cmd {
        let Phase::Scan { problem, .. } = &mut model.phase else { return Command::done() };
        match Mnemonic::from_qr(payload) {
            Ok(phrase) => {
                model.phase = Phase::Import { text: Zeroizing::new(format!("{} ", phrase.phrase())) };
                haptic(Haptic::Success)
            }
            Err(e) => {
                // the camera stays off until the person tries again
                *problem = Some(e.into());
                haptic(Haptic::Error)
            }
        }
    }

    fn back(&self, model: &mut Model) {
        let phase = std::mem::replace(&mut model.phase, Phase::Welcome);
        model.phase = match phase {
            Phase::Import { .. } => Phase::Welcome,
            Phase::Passphrase { typed, .. } => Phase::Import { text: typed },
            Phase::Code { back, .. } => *back,
            Phase::Scan { purpose: Purpose::Phrase, typed, .. } => match typed {
                Some(text) => Phase::Import { text },
                None => Phase::Welcome,
            },
            Phase::Scan { purpose: Purpose::Request, .. }
            | Phase::Account { .. }
            | Phase::Connect { .. }
            | Phase::Review { .. }
            | Phase::Refused { .. } => Phase::Home,
            other => other,
        };
    }

    fn action(&self, action: Action, model: &mut Model) -> Cmd {
        let open = model.wallet.is_some();
        // while the phone is online, only the radios, the language and closing the wallet are heard
        if !model.offline()
            && !matches!(
                action,
                Action::Radios { .. } | Action::Close | Action::DismissToast | Action::Language { .. }
            )
        {
            return Command::done();
        }
        match action {
            Action::Language { language } => model.language = language,
            Action::Close => model.forget(),
            Action::Radios { wifi, bluetooth, cellular, network } => {
                model.radios = [wifi, bluetooth, cellular, network]
            }
            Action::Back => self.back(model),
            Action::DismissToast => model.toast = None,

            // ---------------------------------------------------------- the phrase
            Action::Begin if matches!(model.phase, Phase::Welcome) => {
                model.phase = Phase::Import { text: Zeroizing::new(String::new()) };
            }
            Action::PhraseInput { text } => {
                let text = Zeroizing::new(text);
                if let Phase::Import { text: t } = &mut model.phase {
                    *t = autocomplete(t, &text);
                }
            }
            Action::Suggestion { word } => {
                let word = Zeroizing::new(word);
                if let Phase::Import { text } = &mut model.phase {
                    *text = complete_last(text, &word);
                }
            }
            Action::PhraseDone => {
                if let Phase::Import { text } = &mut model.phase {
                    *text = expand(text, true);
                    match Mnemonic::parse(text) {
                        Ok(phrase) => {
                            let typed = text.clone();
                            let passphrase = Zeroizing::new(String::new());
                            model.phase = Phase::Passphrase { phrase, typed, passphrase, problem: None };
                        }
                        Err(e) => model.toast = Some(e.into()),
                    }
                }
            }
            Action::PassphraseInput { passphrase: p } => {
                let p = Zeroizing::new(p);
                if let Phase::Passphrase { passphrase, problem, .. } = &mut model.phase {
                    *passphrase = Zeroizing::new(p.chars().take(256).collect());
                    *problem = None;
                }
            }
            Action::Open => {
                let Phase::Passphrase { phrase, passphrase, problem, .. } = &mut model.phase else {
                    return Command::done();
                };
                match phrase.seed(passphrase).and_then(|seed| Wallet::new(&seed)) {
                    Ok(wallet) => {
                        model.wallet = Some(wallet);
                        model.index = 0;
                        model.phase = Phase::Home;
                        return haptic(Haptic::Success);
                    }
                    Err(e) => *problem = Some(e.into()),
                }
            }

            // ---------------------------------------------------------- accounts
            Action::Account { index } if open && index < ACCOUNTS => model.index = index,
            Action::Page { next } if open => {
                let first = page_of(model.index).start;
                model.index = if next {
                    if first + PAGE < ACCOUNTS { first + PAGE } else { first }
                } else {
                    first.saturating_sub(PAGE)
                };
            }
            Action::OpenAccount { network } if open => {
                model.phase = Phase::Account { network: network.into() }
            }
            Action::ShareAccount { network } if open => {
                let index = model.index;
                self.share(
                    model,
                    &[network.into()],
                    index..index + 1,
                    Phase::Account { network: network.into() },
                )
            }
            Action::Connect if open => model.phase = Phase::Connect { selected: [true; 2], all: true },
            Action::ConnectScope { all: choice } => {
                if let Phase::Connect { all, .. } = &mut model.phase {
                    *all = choice;
                }
            }
            Action::ToggleNetwork { network } => {
                if let Phase::Connect { selected, .. } = &mut model.phase {
                    let n: Network = network.into();
                    let i = Network::ALL.iter().position(|x| *x == n).unwrap();
                    selected[i] = !selected[i];
                }
            }
            Action::ShowAccounts if open => {
                if let Phase::Connect { selected, all } = model.phase {
                    let networks: Vec<Network> =
                        Network::ALL.iter().zip(selected).filter(|(_, s)| *s).map(|(n, _)| *n).collect();
                    let indexes = if all { page_of(model.index) } else { model.index..model.index + 1 };
                    if networks.is_empty() {
                        model.toast = Some(text!("Choose at least one network.", "至少选择一个网络。"));
                    } else {
                        self.share(model, &networks, indexes, Phase::Home);
                    }
                }
            }

            // ---------------------------------------------------------- scanning, signing
            Action::Scan => {
                let scan = |purpose, typed| Phase::Scan { purpose, progress: None, problem: None, typed };
                let next = match &model.phase {
                    // "try again" after a failure
                    Phase::Scan { purpose, typed, problem: Some(_), .. } => {
                        Some(scan(*purpose, typed.clone()))
                    }
                    _ if open => Some(scan(Purpose::Request, None)),
                    Phase::Welcome => Some(scan(Purpose::Phrase, None)),
                    Phase::Import { text } => Some(scan(Purpose::Phrase, Some(text.clone()))),
                    _ => None,
                };
                if let Some(next) = next {
                    model.phase = next;
                }
            }
            Action::CameraFailed { message } => {
                if let Phase::Scan { problem, .. } = &mut model.phase {
                    // from the shell, in its own language
                    *problem = Some(Text::same(message));
                }
            }
            Action::Reject => {
                if matches!(model.phase, Phase::Review { .. }) {
                    model.phase = Phase::Home;
                }
            }
            Action::Sign => {
                let (Phase::Review { review }, Some(wallet)) = (&model.phase, &model.wallet) else {
                    return Command::done();
                };
                return match review.sign(wallet) {
                    Ok(signed) => {
                        let n = signed.txs.len();
                        let caption = if n == 1 {
                            text!(
                                "Scan this with the web app to broadcast the transaction. Until then, nothing is sent.",
                                "用网页助手扫描这个动态码来广播这笔交易。在此之前，什么都不会发出。"
                            )
                        } else {
                            text!(
                                "Scan this with the web app to broadcast all {n} transactions. Until then, nothing is sent.",
                                "用网页助手扫描这个动态码来广播全部 {n} 笔交易。在此之前，什么都不会发出。"
                            )
                        };
                        let title = text!("Signed", "已签名");
                        self.show_code(model, title, caption, Message::Signed(signed), Phase::Home);
                        haptic(Haptic::Success)
                    }
                    Err(e) => {
                        let title = text!("Signing failed", "签名失败");
                        model.phase = Phase::Refused { title, message: e.into() };
                        haptic(Haptic::Error)
                    }
                };
            }
            Action::Done => {
                if matches!(model.phase, Phase::Code { .. } | Phase::Refused { .. }) {
                    self.back(model);
                }
            }
            _ => {}
        }
        Command::done()
    }
}

/// Typing forward expands every finished word — one followed by a space — that is the start
/// of exactly one word in the list (every BIP-39 word is unique by its first four letters):
/// "aban " becomes "abandon ". Nothing changes under the person's fingers mid-word, deleting
/// never expands, and a pasted phrase of prefixes expands in one go.
///
/// The phrase passes through here a keystroke at a time: every copy is wiped when dropped, and
/// buffers are sized up front so that growing one never leaves the old one behind.
fn autocomplete(old: &str, new: &str) -> Zeroizing<String> {
    let mut text = Zeroizing::new(String::with_capacity(new.len().min(1600)));
    text.extend(new.chars().take(400));
    // typing — at the end, or a word fixed in the middle — completes the finished words and
    // keeps one space between words; deleting changes nothing
    if text.chars().count() <= old.chars().count() {
        return text;
    }
    // where the keystroke landed — the end of what changed, found from both ends in characters
    // (a paste may replace text of another length in bytes): the word there is still being
    // typed, unless the keystroke was the space that finishes it
    let (old_chars, new_chars) = (old.chars().count(), text.chars().count());
    let same_start = old.chars().zip(text.chars()).take_while(|(a, b)| a == b).count();
    let same_end = old
        .chars()
        .rev()
        .zip(text.chars().rev())
        .take(old_chars.min(new_chars) - same_start)
        .take_while(|(a, b)| a == b)
        .count();
    let typed_to = text.char_indices().nth(new_chars - same_end).map_or(text.len(), |(i, _)| i);
    let finished = text[..typed_to].ends_with(char::is_whitespace);
    let done = expand_except(&text, false, (!finished).then_some(typed_to));
    let mut tidy = Zeroizing::new(String::with_capacity(done.len() + 1));
    for (k, word) in done.split_whitespace().enumerate() {
        if k > 0 {
            tidy.push(' ');
        }
        tidy.push_str(word);
    }
    if done.ends_with(char::is_whitespace) && !tidy.is_empty() {
        tidy.push(' ');
    }
    tidy
}

/// Expands the finished words of `text` (and the last one too when `all`).
fn expand(text: &str, all: bool) -> Zeroizing<String> {
    expand_except(text, all, None)
}

/// [`expand`], leaving alone the word that ends at or contains byte `keep` (the one being typed).
fn expand_except(text: &str, all: bool, keep: Option<usize>) -> Zeroizing<String> {
    // a word grows by at most 7 letters, and words are at least 2 bytes apart
    let mut out = Zeroizing::new(String::with_capacity(text.len() * 5 + 16));
    let mut rest = text;
    while let Some(i) = rest.find(|c: char| !c.is_whitespace()) {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let start = text.len() - rest.len();
        let end = rest.find(char::is_whitespace);
        let token = &rest[..end.unwrap_or(rest.len())];
        let typing = keep.is_some_and(|k| (start..=start + token.len()).contains(&k));
        let lower = Zeroizing::new(token.to_lowercase());
        match completions(&lower, 2)[..] {
            [only] if (end.is_some() || all) && !typing && word_index(&lower).is_none() => out.push_str(only),
            _ => out.push_str(token),
        }
        rest = &rest[token.len()..];
    }
    out.push_str(rest);
    out
}
/// The text with its last, unfinished word replaced by `word` and a space.
fn complete_last(text: &str, word: &str) -> Zeroizing<String> {
    let keep = text.trim_end_matches(|c: char| !c.is_whitespace()).len();
    let mut out = Zeroizing::new(String::with_capacity(keep + word.len() + 1));
    out.push_str(&text[..keep]);
    out.push_str(word);
    out.push(' ');
    out
}

/// What the import screen says about the phrase typed so far.
fn phrase_input(text: &str, lang: Language) -> PhraseInput {
    let lower = text.to_lowercase();
    let tokens: Vec<&str> = lower.split_whitespace().collect();
    let typing = !text.is_empty() && !text.ends_with(char::is_whitespace);
    let words: Vec<WordEntry> = tokens
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let state = if word_index(w).is_some() {
                WordState::Known
            } else if typing && i == tokens.len() - 1 && !completions(w, 1).is_empty() {
                WordState::Typing
            } else {
                WordState::Unknown
            };
            WordEntry { word: w.to_string(), state }
        })
        .collect();
    let current = if typing { tokens.last().copied() } else { None };
    let suggestions: Vec<String> = current
        .map(|w| completions(w, 4))
        .unwrap_or_default()
        .into_iter()
        .filter(|s| Some(*s) != current)
        .map(String::from)
        .collect();
    let mut problem = words.iter().position(|w| w.state == WordState::Unknown).map(|i| {
        if typing && i == words.len() - 1 {
            text!("No word in the list starts with “{}”.", "词表中没有以“{}”开头的词。", words[i].word)
        } else {
            text!("Word {} is not in the BIP-39 word list.", "第 {} 个词不在 BIP-39 词表中。", i + 1)
        }
    });
    let valid = Mnemonic::parse(text).is_ok();
    if problem.is_none() && !valid && !typing && Mnemonic::WORD_COUNTS.contains(&words.len()) {
        problem = Some(text!(
            "The words are in the list, but the phrase is not valid. Check each word and the order.",
            "这些词都在词表中，但助记词无效。请检查每个词和顺序。"
        ));
    }
    let can_continue = words.len() >= Mnemonic::WORD_COUNTS[0] && problem.is_none();
    let problem = problem.map(|p| lang.of(&p));
    PhraseInput { text: text.to_string(), words, suggestions, problem, valid, can_continue }
}

fn account_row(wallet: &Wallet, network: Network, index: u32, lang: Language) -> AccountRow {
    let ((name_en, name_zh), (assets_en, assets_zh)) = (network_name(network), network_assets(network));
    AccountRow {
        network: network.into(),
        name: lang.pick(name_en, name_zh).into(),
        assets: lang.pick(assets_en, assets_zh).into(),
        index,
        address: wallet.address(network, index).unwrap_or_default(),
        path: network.path(index),
    }
}

fn review_view(r: &Review, lang: Language) -> ReviewView {
    let n = r.transfers.len();
    // a Bitcoin request is one transaction, whatever it pays; an EVM request one per transfer
    let several = r.network == Network::Evm && n > 1;
    let hold_label = if several {
        text!("Hold to sign {n} transactions", "按住签名 {n} 笔交易")
    } else {
        text!("Hold to sign", "按住签名")
    };
    let all = |texts: &[Text]| texts.iter().map(|t| lang.of(t)).collect();
    ReviewView {
        network: r.network.into(),
        chain: lang.of(&r.chain),
        testnet: r.testnet,
        from_index: r.from.index,
        from_address: r.from.address.clone(),
        transfers: r
            .transfers
            .iter()
            .enumerate()
            .map(|(k, t)| TransferView {
                label: several.then(|| lang.of(&text!("{} of {n}", "第 {} 笔，共 {n} 笔", k + 1))),
                to: t.to.clone(),
                own_index: t.own,
                amount: t.amount.clone(),
                asset: lang.of(&t.asset),
                token: t.token.clone(),
                verified: t.verified,
                note: t.note.as_ref().map(|n| lang.of(n)),
            })
            .collect(),
        fee: lang.of(&r.fee),
        details: r.details.iter().map(|(l, v)| Detail { label: lang.of(l), value: lang.of(v) }).collect(),
        warnings: all(&r.warnings),
        notices: all(&r.notices),
        hold_label: lang.of(&hold_label),
    }
}

impl App for Airkeys {
    type Event = Event;
    type Model = Model;
    type ViewModel = ViewModel;
    type Effect = Effect;

    fn update(&self, event: Event, model: &mut Model) -> Cmd {
        let cmd = match event {
            Event::Action(a) => self.action(a, model),
            Event::Received(bytes) => match model.phase {
                Phase::Scan { purpose: Purpose::Request, .. } => self.received(model, &bytes),
                _ => Command::done(),
            },
            Event::QrScanned(mut payload) => {
                let cmd = match model.phase {
                    Phase::Scan { purpose: Purpose::Phrase, .. } => self.qr(model, &payload),
                    _ => Command::done(),
                };
                payload.zeroize(); // it may hold a phrase or its entropy
                cmd
            }
            Event::Progress { received, needed } => {
                if let Phase::Scan { progress, .. } = &mut model.phase {
                    *progress = Some((received, needed));
                }
                Command::done()
            }
        };
        model.rev += 1;
        let platform = model.reconcile();
        Command::all([platform, cmd, render()])
    }

    fn view(&self, model: &Model) -> ViewModel {
        let wallet = model.wallet.as_ref();
        let lang = model.language;
        let say = |t: &Text| lang.of(t);
        let pick = |(en, zh): Words| lang.pick(en, zh).to_string();
        let screen = match (&model.phase, wallet) {
            _ if !model.offline() => Screen::Offline {
                radios: RADIOS
                    .iter()
                    .zip(model.radios)
                    .map(|(&(kind, name, on, active), state)| RadioRow {
                        kind,
                        name: pick(name),
                        state,
                        detail: match state {
                            RadioState::Off => None,
                            RadioState::On => Some(pick(on)),
                            RadioState::Active => Some(pick(active)),
                            RadioState::Unknown => Some(pick((
                                "This phone does not say. Airkeys counts it as on.",
                                "这部手机没有提供状态。Airkeys 按已打开处理。",
                            ))),
                        },
                    })
                    .collect(),
                wallet_open: wallet.is_some(),
            },
            (Phase::Welcome, _) => Screen::Welcome,
            (Phase::Import { text }, _) => Screen::Import { phrase: phrase_input(text, lang) },
            (Phase::Passphrase { passphrase, problem, .. }, _) => Screen::Passphrase {
                passphrase: passphrase.to_string(),
                problem: problem
                    .as_ref()
                    .map(say)
                    .or_else(|| check_passphrase(passphrase).err().map(|e| say(&e.into()))),
            },
            (Phase::Home, Some(w)) => Screen::Home {
                index: model.index,
                accounts: Network::ALL.iter().map(|&n| account_row(w, n, model.index, lang)).collect(),
                page: {
                    let p = page_of(model.index);
                    WheelPage {
                        first: p.start,
                        last: p.end - 1,
                        label: format!("#{} – #{}", p.start, p.end - 1),
                        previous: p.start > 0,
                        next: p.end < ACCOUNTS,
                    }
                },
            },
            (Phase::Account { network }, Some(w)) => {
                Screen::Account { account: account_row(w, *network, model.index, lang) }
            }
            (Phase::Connect { selected, all }, Some(_)) => Screen::Connect {
                index: model.index,
                scopes: vec![
                    ScopeChoice {
                        all: false,
                        title: say(&text!("Account #{}", "账户 #{}", model.index)),
                        detail: pick(("The account on the home screen.", "首页上的账户。")),
                        selected: !all,
                    },
                    ScopeChoice {
                        all: true,
                        title: say(&text!(
                            "Accounts #{} to #{}",
                            "账户 #{} 到 #{}",
                            page_of(model.index).start,
                            page_of(model.index).end - 1
                        )),
                        detail: say(&text!(
                            "{PAGE} accounts, for every balance. For another {PAGE}, turn the wheel on the home screen to them first. The web app and the services it reads balances from can tell these addresses belong together.",
                            "{PAGE} 个账户，可查看全部余额。要连接另外 {PAGE} 个，先在首页把滚轮转到那里。网页助手和它查询余额所用的服务能看出这些地址属于同一个钱包。"
                        )),
                        selected: *all,
                    },
                ],
                choices: Network::ALL
                    .iter()
                    .zip(selected)
                    .map(|(n, s)| NetworkChoice {
                        network: (*n).into(),
                        name: pick(network_name(*n)),
                        selected: *s,
                    })
                    .collect(),
            },
            (Phase::Code { title, caption, json, .. }, _) => Screen::Code {
                title: say(title),
                caption: say(caption),
                json: json.clone(),
                message: crate::view::lay_out_json(json),
            },
            (Phase::Scan { purpose, progress, problem, .. }, _) => {
                let (title, hint) = match purpose {
                    Purpose::Request => (
                        ("Scan request", "扫描请求"),
                        (
                            "Point the camera at the code on the web app's Send screen.",
                            "把摄像头对准网页助手“转出”页面上的动态码。",
                        ),
                    ),
                    Purpose::Phrase => (
                        ("Scan recovery phrase", "扫描助记词"),
                        (
                            "Point the camera at your SeedQR or CompactSeedQR. You check the words before the wallet opens.",
                            "把摄像头对准你的 SeedQR 或 CompactSeedQR。打开钱包前，你会先核对这些词。",
                        ),
                    ),
                };
                Screen::Scan {
                    title: pick(title),
                    hint: pick(hint),
                    progress: progress.map(|(received, needed)| ScanProgress { received, needed }),
                    problem: problem.as_ref().map(say),
                }
            }
            (Phase::Review { review }, Some(_)) => Screen::Review { review: review_view(review, lang) },
            (Phase::Refused { title, message }, _) => {
                Screen::Refused { title: say(title), message: say(message) }
            }
            // a wallet screen without a wallet cannot happen; show the start
            (_, None) => Screen::Welcome,
        };
        ViewModel {
            rev: model.rev,
            screen,
            toast: model.toast.as_ref().map(say),
            version: format!(
                "Airkeys {} · protocol v{}",
                env!("CARGO_PKG_VERSION"),
                airkeys_wallet::protocol::VERSION
            ),
            language: lang,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacing_text_of_any_script_never_panics() {
        // more characters in fewer bytes, a replacement ending inside a multi-byte character,
        // an emoji pasted over a word
        for (old, new) in [("éé", "abc"), ("ab", "xé√"), ("aban", "😀 aban "), ("é aban", "aban aban ")]
        {
            let _ = autocomplete(old, new);
        }
        assert_eq!(*autocomplete("é", "é aban "), "é abandon ", "a finished word still completes");
    }

    #[test]
    fn completing_the_last_word() {
        assert_eq!(*complete_last("abandon aba", "abandon"), "abandon abandon ");
        assert_eq!(*complete_last("zo", "zoo"), "zoo ");
        assert_eq!(*complete_last("abandon ", "about"), "abandon about ");
    }

    #[test]
    fn finished_prefixes_expand_while_typing_forward() {
        assert_eq!(*autocomplete("", "a"), "a");
        assert_eq!(*autocomplete("ab", "aba"), "aba", "nothing changes mid-word");
        assert_eq!(*autocomplete("aban", "aban "), "abandon ");
        assert_eq!(*autocomplete("Aban", "Aban "), "abandon ");
        assert_eq!(*autocomplete("abandon actu", "abandon actu "), "abandon actual ");
        // a word that begins others stays itself; an ambiguous prefix stays as typed
        assert_eq!(*autocomplete("act", "act "), "act ");
        assert_eq!(*autocomplete("ab", "ab "), "ab ");
        // deleting never expands
        assert_eq!(*autocomplete("abandon abou ", "abandon abou"), "abandon abou");
        // a pasted phrase of prefixes expands in one go, except the word still open
        assert_eq!(*autocomplete("", "aban abou zoo"), "abandon about zoo");
        assert_eq!(*expand("aban abou", true), "abandon about");
    }

    #[test]
    fn phrase_hints() {
        let en = Language::En;
        let p = phrase_input("abandon abandon xyz abandon", en);
        assert_eq!(p.problem.as_deref(), Some("Word 3 is not in the BIP-39 word list."));
        assert_eq!(p.words[2].state, WordState::Unknown);
        let p = phrase_input("abandon ab", en);
        assert_eq!(p.suggestions, vec!["abandon", "ability", "able", "about"]);
        assert_eq!(p.words[1].state, WordState::Typing);
        assert!(p.problem.is_none());
        let p = phrase_input("abandon qq", en);
        assert!(p.problem.unwrap().contains("starts with “qq”"));
        let twelve = "abandon ".repeat(12);
        assert!(phrase_input(&twelve, en).problem.unwrap().contains("not valid"));
        let zh = phrase_input(&twelve, Language::Zh).problem.unwrap();
        assert!(zh.contains("助记词无效"), "{zh}");
        let ok = "abandon ".repeat(11) + "about ";
        let p = phrase_input(&ok, en);
        assert!(p.valid && p.problem.is_none() && p.suggestions.is_empty() && p.words.len() == 12);
    }
}
