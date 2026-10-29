# Airkeys design

Why Airkeys works as it does, and what is and is not verified. The wire format is in
[PROTOCOL.md](PROTOCOL.md); recovery without Airkeys is in [RECOVERY.md](RECOVERY.md).

## Goal and threat model

Airkeys protects Bitcoin and Ethereum-family funds held for the long term ("bunker mode")
against:

| Adversary | What Airkeys does |
|---|---|
| A **future quantum computer** that derives private keys from public keys | Reveals no public key before an account spends; keeps account keys independent (hardened derivation); by default moves what stays behind to a fresh account. |
| A **compromised online computer** (the web app, its browser, its endpoints) | It sees only addresses and can only propose transfers: the phone builds and checks every byte, and shows recipient, amount, chain and fee before you hold to sign. |
| A **thief of the phone** | Nothing is stored. While the wallet is open, in the background too, the phrase is in memory, guarded only by the lock screen: close the wallet when done. |
| **Network exposure of the signing phone** | The app refuses to work while Wi-Fi, Bluetooth or mobile data is on. The Android app has no internet permission. |

Out of scope: a compromised phone operating system (it sees the phrase as it is typed); signing
without reading the review; a quantum attack on a transaction in the mempool (its key is public
once broadcast); privacy from the web app's endpoints ([Many accounts](#many-accounts-in-the-web-app)).

## Decisions

### Two networks
Bitcoin (native SegWit) and EVM chains with ERC-20 tokens: on both, the design relies on an
address being a hash of a public key. An account has one address on every EVM chain. The
registry lists 23 EVM mainnets (Ethereum, Base, Arbitrum One, OP Mainnet, Polygon, BNB Smart
Chain, Avalanche C-Chain, Monad and others) and 8 testnets, with about 300 tokens: on each
network its stablecoins and wrapped coin, and the tokens with the largest market caps whose
address two sources agree on. Other networks can be [added](#adding-a-network), and other
tokens in Settings, by name or address (read from the contract, never priced, and shown by the
phone as not listed).

### Addresses only
The phone shares `{ network, index, address }` and nothing else
([PROTOCOL §4](PROTOCOL.md#4--accounts--phone--web)): no public key, extended key or path. A
reply names new accounts the same way ([§6](PROTOCOL.md#6--signed--phone--web)). Other cold
wallets hand out public keys when they connect ([§1](PROTOCOL.md#1--why-this-protocol-exists)).

### Every derivation step hardened
`m/65738275'/84'/0'/0'/0'/i'` and `m/65738275'/44'/60'/0'/0'/i'`. With non-hardened steps, a
child private key plus its parent's extended public key gives the parent private key, so one
key broken through its public key could open every sibling; hardened steps confine the damage
to that account. The cost is that these are not other wallets' default paths, though standard
tools still recover them ([RECOVERY.md](RECOVERY.md)).

### A path of its own
Hardening does not protect descendants from an ancestor: a node's private key and chain code
derive everything below it. Standard wallets hand out extended public keys for `m/44'/60'/0'`
(Keystone) and `m/84'/0'/0'` (any Bitcoin watch-only wallet), ancestors of
`m/44'/60'/0'/0'/i'` and `m/84'/0'/0'/0'/i'`. Had the phrase ever been in such a wallet, one
quantum break of that key would reach every account.

Every path therefore starts with `65738275'` ("AIRK" in ASCII decimal codes, as BIP-85 writes
"SEED" as `83696968'`). No standard wallet derives under it, so no key another wallet exported
for the same phrase is an ancestor of an Airkeys account, and a phrase also used elsewhere
needs no warning. Only a tool that exports the root's extended public key (depth 0) exposes
every path, which is why RECOVERY.md's root-key script is meant for an offline computer.

### Transfers only, built by the phone
A request carries readable transfer fields, never transaction bytes, calldata or scripts
([PROTOCOL §5](PROTOCOL.md#5--sign--web--phone)). The phone builds every byte it signs, so it
can sign only the transfer it shows: BTC, a chain's native coin, or an ERC-20 `transfer`. No
message signing, other contract calls or NFTs. Unknown fields, versions and types are refused.

### Bunker mode, by default
Sending reveals the sending account's key, so by default what stays behind moves to a fresh
account:
- **EVM**: the request (up to 16 transactions) follows the payment with every other token and
  the remaining native coin on that chain, in one signing and one scan each way. "Leave it
  here" sends only the amount entered.
- **Bitcoin**: a transaction spends whole coins, so the web app spends all of the account's
  coins and sends the change to the fresh account. Any amount can be sent.
- The phone refuses any output to the paying address, in any form of its key (PROTOCOL §6,
  check 4), with one exception: one Bitcoin output may return change to it, written by index or
  exactly as §3 spells the address. This is Airkeys' rule, not Bitcoin's: Bitcoin itself lets
  change return to any address. Bunker mode never uses the exception; a plain cold wallet does.
- Review shows what moving the rest adds to the fee, apart. Bunker mode can be turned off in
  Settings, for those who keep Airkeys as a plain cold wallet: a send then leaves the rest in
  place, receiving stays on the lowest account, and Home shows no Bunker / Exposed split, To
  move list or exposure marks, and Bitcoin change comes back to the paying account, so the coins
  stay on one account. Exposure is still read from the chain on every refresh, so turning
  bunker mode back on shows it at once; no account counts as hidden again for a switch.
- The fresh account is the lowest connected account, other than the payer, that the web app
  has read and found unused. The phone derives accounts named by number (`{ "index": 1 }`)
  itself, so the web app cannot redirect "your account #1".
- Every move uses up a fresh account. The phone shares accounts a page at a time (#0 to #99,
  #100 to #199, up to #9999: the page the home screen's wheel is on), so a code stays one page
  of 200 addresses. Home asks for the next page when fewer than five unused accounts are
  connected, and names it.
- Reserved but unused EVM gas is refunded to the old account and stays there as dust.
- **Other EVM chains** are reported, not swept. A first send on one reveals the key on all of
  them, but a request covers one chain, and sweeping every chain in one signing would make a
  long, unusual request. Before a first send the web app says what the account holds on other
  chains; afterwards Home lists each chain under **To move**. A move pays no one: every token,
  then the coin minus fees, to a fresh account (`moveAll`; on Bitcoin, every coin to one
  output).

### Bitcoin inputs prove their amounts
Each input carries its whole previous transaction, which the phone checks
([PROTOCOL §5.1](PROTOCOL.md#51--bitcoin)). Otherwise a malicious web app could lie about input
amounts across two signings and build a transaction with a huge hidden fee (the segwit-v0 fee
attack).

### Names and amounts the phone can trust
Chain names, native coins and well-known tokens come from [`registry/networks.json`](../registry/networks.json),
compiled into the phone (symbols and decimals checked against the chains). How listed and
unlisted tokens and chains are treated is in [PROTOCOL §5.3](PROTOCOL.md#53--tokens). Amounts
are exact integers end to end.

### Nothing created, nothing stored
Airkeys never generates a recovery phrase, so the phone needs no randomness and is not
responsible for one. The phrase (typed, or from a SeedQR, CompactSeedQR or text QR) and the
optional passphrase stay in the core's memory, in the background too, until the wallet or the
app is closed; nothing is written to storage, backups or the keychain. Rust holds secrets in
zeroizing buffers; platform text fields and FFI copies are ordinary memory, freed but not
wiped.

### Air gap, enforced
Until Wi-Fi, Bluetooth, mobile data and every network connection are off, the core shows only a
"take this phone offline" screen. When a radio comes back, everything pauses (camera off, codes
hidden, a phrase protected) and the open wallet waits.

A switch is not proof, so a radio switched off but seen working counts as "still active":
- **Any network** (Wi-Fi, cellular, USB or Bluetooth tethering, Ethernet, VPN) must be absent.
- **Bluetooth** is off only when the adapter, its state and the system setting all say so and
  no Bluetooth Low Energy scanner exists (one exists only while the radio is powered). The
  adapter API alone said "off" while Bluetooth was on in MIUI's "half-on" mode.
- **Mobile data**: Airplane mode, and no cellular signal (visible to apps from Android 10; on 8
  and 9, Airplane mode alone).
- **Wi-Fi**: off, and not scanning in the background ("Wi-Fi scanning" with Location on keeps
  the radio searching).

On Android, each row that is not off opens the system screen that turns it off; for "still
active", the Location scanning screen, which holds both scanning switches. None of this needs a
permission; reading scan results or nearby Bluetooth devices would need "Nearby devices",
whose prompt (find and locate nearby devices) has no place in a cold wallet.

iOS has no public API for the Wi-Fi radio. The app sees Wi-Fi when a Wi-Fi interface exists,
the cellular radio when it is registered on a network, Bluetooth through CoreBluetooth (a
one-time permission; until granted, Bluetooth counts as on), and any network through
NWPathMonitor. Unknown counts as on.

### Typing a phrase
The phrase is typed into one field. Finished words are completed from their first letters (each
BIP-39 word is unique by its first four): `aban␣` becomes `abandon␣`. Completion happens only on
a space or Continue, never mid-word or while deleting, and the field takes the core's text back
within the same edit, so fast typing cannot race it. A numbered grid mirrors the paper and marks
unknown words; tapping one selects it for retyping. No autocorrect or keyboard learning; Android
blocks screenshots while a phrase is shown.

### Choosing an account
On the home screen a wheel like the iOS Timer's picks the account, #0 to #99, with a haptic tick
per number passed; the account is chosen when the wheel rests. iOS uses the system wheel;
Android draws the same drum in Compose, ticking with `SEGMENT_FREQUENT_TICK` (Android 14+) or
`CLOCK_TICK`. The core owns the range and ignores anything outside it. Connect shows one account
or, by default, all 100 (200 addresses across both networks).

### One core, thin shells
`core/app` is a [Crux](https://github.com/redbadger/crux) app: events in, a view model and
requests out, no I/O. Every decision (which screen, what is allowed, what may be signed) and all
text about the wallet, requests and checks come from it, so iOS and Android cannot disagree;
the shells add only fixed labels and explanations, identical on both. Lumen Code (sending and
receiving) and QR decoding run in Rust, and every call is answered synchronously, without
callbacks or threads. Platform requests (camera on, keep screen on, block screenshots, haptics)
are notifications derived by one function from the current screen, so no path can leave the
camera on or a phrase unprotected. The shells are about 1,400 lines of Swift and 1,800 of
Kotlin.

### The channel
[Lumen Code](https://github.com/atshelchin/lumen-code) (fountain-coded colour codes, MIT, pinned
by commit in both Rust and JavaScript). Messages are compact JSON that any Lumen Code reader can
read, so anyone can check that a code from the phone holds no key.

Bigger cells in the camera's image read faster and from farther away, so codes fill the screen.
On a phone a code runs edge to edge from the title to the button, taller than wide (Lumen codes
take any shape up to 2.4 : 1), carrying about twice what a square code of the same width in
cells does. The cells (4 colours, 22 % parity) are sized for a laptop webcam across a desk. A
code is 44, 52 or 60 cells across, the first with which a reader catching every frame has the
message within four frames (counted by playing the sender's own schedule into a receiver). A
simulated 720p webcam (blur, sensor noise) read codes 44 and 52 across at 200–260 px wide in its
image; 72 and 84 across needed 340 px. A signed reply takes 44 across and two to four frames;
a page of 100 accounts (8.8 KB compressed), 60 across and about ten frames (a second).

The web app shows a request as large as the window allows: a square of up to 796 px on a
computer (what a phone held upright frames best), or the whole screen in a phone's browser. A
phone's camera close to a screen reads smaller cells than a webcam, so the web app picks the
largest cells, 52 to 84 across, that the phone reads within two frames.

### The web app
A static site with no backend ([README](../app-web/airkeys.app/README.md)). It reads chains
from the browser through endpoints configurable per chain and keeps only addresses and settings
in `localStorage`. Dependencies: Svelte, paulmillr's audited `@noble`/`@scure` primitives,
Lumen Code and a small QR encoder.

### Many accounts in the web app
Public endpoints limit how fast one visitor may ask, so balances are read in bulk:
- **EVM**: Multicall3 reads 1,000 coin and token balances per `eth_call`, four calls at a time
  (halved where an endpoint refuses the size), and one JSON-RPC batch the nonces of 50
  addresses (fewer where an endpoint asks, batches 300 ms apart); 100 accounts and 60 tokens
  take about 3 s per chain. A nonce above zero, on any chain the
  registry lists, testnets included, marks the key exposed on every EVM chain.
- What is on screen is read again every minute while the page is in view, and when it comes
  back into view; a background read that misses a chain keeps the last complete figures.
- **Bitcoin**: Esplora answers one address per request, so accounts are read in order, three
  at a time, stopping after 10 unused in a row (the usual gap limit; bunker mode fills the
  lowest unused account). The rest show "not checked", with a button to check them.
- HTTP 429 is retried after 1, 3 and 9 s. Bitcoin falls back from mempool.space to
  Blockstream's Esplora when the first does not answer, unless Settings name an endpoint.
- Accounts that hold nothing fold into one line; the first account always shows.

The endpoints can link addresses asked about together. Your own nodes in Settings prevent that;
connecting one account at a time reduces it.

### Home: what is held, and what should move
The web app opens on a total split into **Bunker** (behind keys never revealed) and **Exposed**
(behind keys that have signed). Under To move, each chain of each exposed account has a Move
button. Below is every asset across accounts and chains, by worth and filterable by chain; each
opens to the accounts holding it, and the accounts fold away under the list. As in Vela, a
figure is never confidently wrong: what is not yet read shows a placeholder, not "$0"; a chain
that did not answer, or an asset without a price, is named and not counted.

### Prices
Chainlink price feeds, read through the chain endpoints in Settings: ETH, BTC, USDC, USDT, DAI,
POL and AVAX on Ethereum, BNB on BNB Smart Chain. An answer older than a day counts as no price.
Only what Airkeys lists is priced (a listed mainnet's coin, or a token at a listed address; WETH
and WBTC as their coins), so a token calling itself "USDC", or a hand-added chain calling its
coin "ETH", shows no value. Other display currencies use Vela's exchange-rate service
(`vela-currency.getvela.app`, rates from USD; the endpoint is a setting). Neither request
carries an address. Test networks are never priced.

### Mainnet and testnet kept apart
The web app shows either the real or the test networks (Sepolia and any added), never both.
Balances, sends and totals follow the switch; test mode shows an amber strip and leaves out
Bitcoin (mainnet only). The phone labels a listed test network "Testnet" on its review. Key
exposure counts every chain in both modes, since a signature on a test network reveals the same
key.

### Adding a network
Settings searches the 2,897 chains of [ethereum-data.getvela.app](https://ethereum-data.getvela.app).
Picking one fills in its name, coin and explorer, offers its stablecoins and marks a test
network. Nothing from the list is trusted: the endpoint must answer with the chain id asked for,
and token decimals are read from the chain. Chains can also be entered by hand.

### Fees on layer 2
On OP-stack chains (Base, OP Mainnet) every transaction also pays a layer-1 data fee from the
same balance (on Base about six times its gas); on Arbitrum a plain transfer needs more than
21 000 gas. The web app reads both from the chain (the fee oracle's upper bound plus 50 %, and
the gas estimate) so the last transfer of a bunker sweep is not refused for lack of fees.

## What is verified

| Claim | How |
|---|---|
| BIP-39 and BIP-32 (hardened) | Official vectors (`core/wallet/src/keys.rs`) |
| Addresses on the Airkeys paths | Foundry `cast`, @scure/bip32, Bitcoin Core descriptors (`core/wallet/tests/derivation.rs`, `core/e2e/recovery.mjs`) |
| EVM signing | EIP-155 example byte for byte; a mainnet fork executes USDC, USDT (non-standard), ETH, EIP-1559 and legacy transactions (`e2e/evm.mjs`) |
| Bitcoin signing | Bitcoin Core 31.1 regtest accepts and mines a 3-input spend to P2TR, P2PKH, P2SH and change (`e2e/bitcoin.mjs`) |
| Recovery without Airkeys | Each RECOVERY.md recipe (Bitcoin Core 31.1, `cast` 1.5, the root-key script as printed) derives the phone's addresses for three accounts per network, with and without a passphrase; a Bitcoin Core wallet from the descriptor sweeps coins on regtest (`e2e/recovery.mjs`) |
| Every refusal in PROTOCOL §7 | One check each across the e2e scripts and unit tests (wrong wallet, checksum, dust, fee attack, nonce gap, token metadata, …) |
| A separate review pass | Not a third-party audit: a second, adversarial review of the core, the protocol and the web app's parser and builders: signing re-verified with libsecp256k1 and alloy; no panic in 229,000 mutated camera frames or 3,000 crafted code packets. Findings, each fixed with a test (`wallet/tests/adversarial.rs`, `scripts/chains/bitcoin.ts`, `web.test.ts`): a crash and a minutes-long hang from crafted addresses, paying `from` back under another spelling, fee warnings weighed against change, an underpaying Bitcoin build, a decimal comma read as a thousands separator, layer-2 fees |
| A real camera, both ways | A Redmi K40 read a request from a MacBook's screen in about 3 s (15 frames/s, ~11 ms per frame), exactly as sent. In the web app, the MacBook's 1080p FaceTime HD camera read all 100 accounts (200 addresses) from the K40's full-screen code, hand-held under glare, a second after first seeing it. An offline iPhone 15 Pro (iOS 26.5.2) read and signed a request from the MacBook's screen; the MacBook read the reply in 0.3 s, its two transactions byte for byte the K40's for the same request |
| The air gap on real phones | Redmi K40: MIUI's half-on Bluetooth (the API alone said off) and Wi-Fi scanning detected; every row off with Airplane mode, Bluetooth and Location off. iPhone 11: Wi-Fi, Bluetooth and a network shown as on. Samsung Galaxy S22 (Android 15): Wi-Fi, Bluetooth, mobile data and a network each shown as on; every row off with Airplane mode, Wi-Fi and Bluetooth off |
| App flows | The real FFI object through import (fixing a word mid-phrase), SeedQR/CompactSeedQR images, passphrases, radios and "still active", the account range, connect (one and all 100, read back from the code), review and signing (`core/app/tests/flows.rs`); iOS UI tests fix a word from the grid and sign |
| Codes on screen are readable | Full-screen code screenshots on the Android emulator and iOS simulator decode to exactly the JSON shown: a page of 100 accounts (17 KB) from 11 screenshots on each, the signed reply from 2 |
| Code sizes | A simulated 720p webcam (blur, sensor noise) and the real scanner, codes 200–420 px wide in its image: which grids read, in how many frames (`core/app/examples/capacity.rs` counts frames for real messages); `core/app/tests/flows.rs` checks the code's shape for an area |
| The account wheel | Android emulator: a slow drag and a fling settle on the number in the band, the addresses follow, the vibration log shows one tick per number; an iOS simulator UI test turns the wheel to 7 and back |
| The web app's Bitcoin client | Against Bitcoin Core regtest behind an Esplora shim: balances, exposure, fee as shown, change to a fresh account, send-all, four refusals, and the phone refusing a forged input (`scripts/chains/bitcoin.ts`) |
| The whole system | Headless Chrome runs the web app, its webcam a video of the phone core's screen: all 200 addresses read through the camera; a request read from the page's pixels, signed, reply scanned, broadcast to a mainnet fork and executed; in a desktop window and a phone-sized browser (`app-web/airkeys.app/scripts/e2e.mjs`, `PHONE=1`) |
| Many accounts against public endpoints | Measured, not a test: 200 addresses in 72 s with 125 requests on the default endpoints, every account resolved (most of the time is Arbitrum's public node answering 429) |
| Speed on a phone | Xiaomi Snapdragon 870: open a wallet 2.7 ms, an address about 0.19 ms (all 200 for Connect: about 40 ms), check a 16-transaction request 3.3 ms, sign it 3.3 ms; scan a 1280×960 camera frame 2.3–13.5 ms. Measured with four networks, before two were dropped; the work per address and request is unchanged |

## Limits

- Cameras are tested on few devices, listed above. Try your own phone and computer before
  trusting them with funds.
- Phones: iPhone 11 and iPhone 15 Pro (iOS 26.5.2), Redmi K40 (Android 13), Samsung Galaxy S22
  (Android 15). The full flow (import, addresses, review, signing, the Connect code) ran on the
  Redmi and the S22 over adb and on the iPhone 15 Pro by hand.
- Haptics were checked in the Android emulator's vibration log and are the system wheel's own
  on iOS; their feel on a real phone was not judged.
- Bitcoin: native SegWit and mainnet only. Spending is all-coins (no coin control), so an
  account's inscriptions or runes would be spent as plain coins.
- The layer-2 fee reserve comes from live chain data but has not executed a sweep on a real
  layer-2 chain (a local fork charges no layer-1 fees).
- iOS cannot see a Wi-Fi radio that is on but not joined to a network.
- Releases: the Android release is not minified and is unsigned unless you configure your own
  key (see [app-android/README.md](../app-android/README.md)); the iOS app is not distributed.
  Set up your own signing.
