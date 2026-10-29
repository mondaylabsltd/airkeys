//! What the shells draw. Every string a person reads is decided here, so iOS and Android
//! say the same thing; the shells choose only how it looks.

/// The whole screen. `rev` grows with every change, so a shell can drop a stale view that
/// arrives late from another thread.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ViewModel {
    pub rev: u64,
    pub screen: Screen,
    /// A one-time message (an error, a confirmation), shown over the screen.
    pub toast: Option<String>,
    /// "Airkeys 0.1.0 · protocol v1"
    pub version: String,
    /// The language every string above is in (`Action::Language` sets it), for the words a
    /// shell draws itself.
    pub language: Language,
}

/// The languages the phone speaks. The shell reports the system's at start and whenever it
/// changes (`Action::Language`); English until then.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum Language {
    /// English.
    #[default]
    En,
    /// Simplified Chinese.
    Zh,
}

impl Language {
    /// The one of an English and a Chinese string that this language reads.
    pub fn pick<'a>(self, en: &'a str, zh: &'a str) -> &'a str {
        match self {
            Language::En => en,
            Language::Zh => zh,
        }
    }

    /// Words of the wallet ([`airkeys_wallet::Text`]) in this language.
    pub fn of(self, t: &airkeys_wallet::Text) -> String {
        self.pick(&t.en, &t.zh).to_string()
    }
}

/// The screen to draw, with everything it shows.
#[derive(Clone, Debug, PartialEq, uniffi::Enum)]
pub enum Screen {
    /// A radio is on (or cannot be checked): nothing works until the phone is offline.
    Offline { radios: Vec<RadioRow>, wallet_open: bool },
    /// No wallet open. Nothing is stored, so this is where every session starts.
    Welcome,
    /// Typing the recovery phrase.
    Import { phrase: PhraseInput },
    /// The optional passphrase, then opening the wallet.
    Passphrase { passphrase: String, problem: Option<String> },
    /// The open wallet: account number `index` on every network, on the wheel's `page`.
    Home { index: u32, accounts: Vec<AccountRow>, page: WheelPage },
    /// One account: its address, path and the notice about its key.
    Account { account: AccountRow },
    /// Choosing what to show the web app: which networks, and account `index` or all of them.
    Connect { index: u32, choices: Vec<NetworkChoice>, scopes: Vec<ScopeChoice> },
    /// An animated code on screen (Lumen Code). `json` is exactly what it carries; `message`
    /// is the same JSON laid out to read.
    Code { title: String, caption: String, json: String, message: Vec<JsonLine> },
    /// The camera, reading a request (Lumen Code) or a recovery phrase (QR code).
    Scan { title: String, hint: String, progress: Option<ScanProgress>, problem: Option<String> },
    /// A request that passed every check, shown in full before the hold to sign.
    Review { review: ReviewView },
    /// A request the phone will not sign, and why.
    Refused { title: String, message: String },
}

/// A row of the offline check.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct RadioRow {
    /// Which radio: what a shell keys on (its settings screen, its permission), never `name`.
    pub kind: RadioKind,
    /// "Wi-Fi", "Bluetooth", "Mobile data", "Network connection"
    pub name: String,
    pub state: crate::ops::RadioState,
    /// What to do, when the row is not off.
    pub detail: Option<String>,
}

/// The radios the offline check looks at.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum RadioKind {
    /// The Wi-Fi radio, scanning included.
    Wifi,
    /// The Bluetooth radio, scanning included.
    Bluetooth,
    /// The cellular radio.
    MobileData,
    /// Any network connection: Wi-Fi, cellular, a cable, tethering, a VPN.
    Network,
}

/// The recovery phrase as typed so far, and what the screen says about it.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct PhraseInput {
    pub text: String,
    /// The words so far, numbered as on paper.
    pub words: Vec<WordEntry>,
    /// Completions for the word being typed.
    pub suggestions: Vec<String>,
    /// What is wrong so far, in a sentence.
    pub problem: Option<String>,
    pub valid: bool,
    /// Enough words and nothing wrong so far: Continue may be pressed (it checks the phrase).
    pub can_continue: bool,
}

/// A word of the phrase, numbered by its place.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct WordEntry {
    pub word: String,
    pub state: WordState,
}

/// Where a word of the phrase stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum WordState {
    /// In the word list.
    Known,
    /// Being typed: the start of at least one word.
    Typing,
    /// Not in the word list.
    Unknown,
}

/// The networks Airkeys signs for, as the shells see them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum NetworkKind {
    /// Bitcoin: native SegWit accounts.
    Bitcoin,
    /// Ethereum and every EVM chain: one address on all of them.
    Evm,
}

impl From<airkeys_wallet::Network> for NetworkKind {
    fn from(n: airkeys_wallet::Network) -> Self {
        use airkeys_wallet::Network as N;
        match n {
            N::Bitcoin => NetworkKind::Bitcoin,
            N::Evm => NetworkKind::Evm,
        }
    }
}

impl From<NetworkKind> for airkeys_wallet::Network {
    fn from(n: NetworkKind) -> Self {
        use airkeys_wallet::Network as N;
        match n {
            NetworkKind::Bitcoin => N::Bitcoin,
            NetworkKind::Evm => N::Evm,
        }
    }
}

/// An account of the open wallet, on one network.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct AccountRow {
    pub network: NetworkKind,
    /// "Bitcoin", "Ethereum & EVM", …
    pub name: String,
    /// The coins it holds, e.g. "BTC" or "ETH, ERC-20 tokens".
    pub assets: String,
    pub index: u32,
    pub address: String,
    pub path: String,
}

/// The home screen's wheel shows one page of account numbers at a time: `first` to `last`.
/// `label` ("#100 – #199") names it; `previous` and `next` say whether there is a page that way.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct WheelPage {
    pub first: u32,
    pub last: u32,
    pub label: String,
    pub previous: bool,
    pub next: bool,
}

/// A network on the Connect screen, included or not.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct NetworkChoice {
    pub network: NetworkKind,
    pub name: String,
    pub selected: bool,
}

/// One account, or every account number: `Action::ConnectScope { all }` picks it.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ScopeChoice {
    pub all: bool,
    pub title: String,
    pub detail: String,
    pub selected: bool,
}

/// How far a code has been read, in fountain symbols.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ScanProgress {
    pub received: u32,
    pub needed: u32,
}

/// A request as the review screen shows it.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ReviewView {
    pub network: NetworkKind,
    pub chain: String,
    /// A test network: the screen says so, its coins have no value.
    pub testnet: bool,
    pub from_index: u32,
    pub from_address: String,
    pub transfers: Vec<TransferView>,
    pub fee: String,
    pub details: Vec<Detail>,
    pub warnings: Vec<String>,
    pub notices: Vec<String>,
    /// The hold-to-sign button: "Hold to sign 3 transactions".
    pub hold_label: String,
}

/// One transfer of a request: how much, and to whom. What it costs is the request's one fee
/// (`ReviewView::fee`): a fee on every card said the same thing again, less usefully.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct TransferView {
    /// "2 of 3", when a request has several (EVM: one transaction each).
    pub label: Option<String>,
    pub to: String,
    pub own_index: Option<u32>,
    pub amount: String,
    pub asset: String,
    pub token: Option<String>,
    pub verified: bool,
    pub note: Option<String>,
}

/// A technical field of a request, for those who look: a label and its value.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct Detail {
    pub label: String,
    pub value: String,
}

/// A line of a JSON message laid out to read: its depth (a level of indentation each) and its
/// pieces. Members stay in their order and every value is exactly as written; a long value that
/// wraps continues at the line's indentation.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct JsonLine {
    pub depth: u32,
    pub pieces: Vec<JsonPiece>,
}

/// A piece of a line of JSON: text of one kind, to colour.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct JsonPiece {
    pub text: String,
    pub kind: JsonKind,
}

/// What a piece of JSON is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JsonKind {
    /// A member's name, quoted.
    Key,
    /// A string value, quoted: an address, an amount, a hash.
    Text,
    /// A number, as written.
    Number,
    /// `true`, `false`, `null`.
    Literal,
    /// Braces, brackets, commas and colons.
    Punctuation,
}

/// `json` a member or an element a line, in pieces by kind. Values are not parsed, so nothing
/// is reordered or rewritten: the text is the code's, laid out. Shells show the lines lazily —
/// all 100 accounts are about a thousand.
pub fn lay_out_json(json: &str) -> Vec<JsonLine> {
    fn push(lines: &mut [JsonLine], text: &str, kind: JsonKind) {
        let pieces = &mut lines.last_mut().expect("a line").pieces;
        match pieces.last_mut() {
            Some(last) if last.kind == kind => last.text.push_str(text),
            _ => pieces.push(JsonPiece { text: text.to_string(), kind }),
        }
    }
    fn line(lines: &mut Vec<JsonLine>, depth: u32) {
        lines.push(JsonLine { depth, pieces: Vec::new() });
    }
    let b = json.as_bytes();
    let skip_space = |mut j: usize| {
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        j
    };
    let mut lines = vec![JsonLine { depth: 0, pieces: Vec::new() }];
    let (mut i, mut depth) = (0, 0);
    while i < b.len() {
        match b[i] {
            open @ (b'{' | b'[') => {
                let close = if open == b'{' { b'}' } else { b']' };
                let j = skip_space(i + 1);
                if j < b.len() && b[j] == close {
                    push(&mut lines, &format!("{}{}", open as char, close as char), JsonKind::Punctuation);
                    i = j + 1;
                } else {
                    push(&mut lines, &(open as char).to_string(), JsonKind::Punctuation);
                    depth += 1;
                    line(&mut lines, depth);
                    i += 1;
                }
            }
            close @ (b'}' | b']') => {
                depth = depth.saturating_sub(1);
                line(&mut lines, depth);
                push(&mut lines, &(close as char).to_string(), JsonKind::Punctuation);
                i += 1;
            }
            b',' => {
                push(&mut lines, ",", JsonKind::Punctuation);
                line(&mut lines, depth);
                i += 1;
            }
            b':' => {
                push(&mut lines, ": ", JsonKind::Punctuation);
                i += 1;
            }
            b'"' => {
                let start = i;
                i += 1;
                while i < b.len() && b[i] != b'"' {
                    i += if b[i] == b'\\' { 2 } else { 1 };
                }
                i = (i + 1).min(b.len());
                let j = skip_space(i);
                let kind = if j < b.len() && b[j] == b':' { JsonKind::Key } else { JsonKind::Text };
                push(&mut lines, &json[start..i], kind);
            }
            c if c.is_ascii_whitespace() => i += 1,
            c => {
                let start = i;
                while i < b.len() && !matches!(b[i], b',' | b':' | b'}' | b']') && !b[i].is_ascii_whitespace()
                {
                    i += 1;
                }
                let kind = if c == b'-' || c.is_ascii_digit() { JsonKind::Number } else { JsonKind::Literal };
                push(&mut lines, &json[start..i], kind);
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_is_laid_out_as_written() {
        let json = r#"{"airkeys":1,"txs":[{"to":{"index":1},"amount":"0.5 \"x\" ok","ok":true,"no":null}],"accounts":[],"n":-2.5e3}"#;
        let lines = lay_out_json(json);
        let text = lines
            .iter()
            .map(|l| {
                "  ".repeat(l.depth as usize) + &l.pieces.iter().map(|p| p.text.as_str()).collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n");
        let value = |s: &str| serde_json::from_str::<serde_json::Value>(s).unwrap();
        assert_eq!(value(&text), value(json), "the same message");
        assert_eq!(
            text.replace([' ', '\n'], ""),
            json.replace(' ', ""),
            "only space added, nothing reordered"
        );
        assert!(
            text.starts_with(
                "{\n  \"airkeys\": 1,\n  \"txs\": [\n    {\n      \"to\": {\n        \"index\": 1\n      },"
            ),
            "{text}"
        );
        assert!(text.contains("\n  \"accounts\": [],\n"), "an empty list stays on its line");
        assert_eq!(lines.len(), text.lines().count());
        let pieces: Vec<_> = lines.iter().flat_map(|l| &l.pieces).collect();
        let kind = |t: &str| pieces.iter().find(|p| p.text == t).map(|p| p.kind);
        assert_eq!(kind("\"airkeys\""), Some(JsonKind::Key));
        assert_eq!(kind(r#""0.5 \"x\" ok""#), Some(JsonKind::Text));
        assert_eq!(kind("1"), Some(JsonKind::Number));
        assert_eq!(kind("-2.5e3"), Some(JsonKind::Number));
        assert_eq!(kind("true"), Some(JsonKind::Literal));
        assert_eq!(kind("null"), Some(JsonKind::Literal));
    }
}
