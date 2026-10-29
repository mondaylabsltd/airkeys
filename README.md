# Airkeys

[![CI](https://github.com/mondaylabsltd/airkeys/actions/workflows/ci.yml/badge.svg)](https://github.com/mondaylabsltd/airkeys/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Protocol v1](https://img.shields.io/badge/protocol-v1-orange.svg)](docs/PROTOCOL.md)

A cold wallet for a phone that stays offline. It gives the online world addresses, never public
keys, so an account's key stays unknown until the account spends.

> [!WARNING]
> Airkeys is young (0.x) and has had no third-party audit. Try it with small amounts first,
> keep your recovery phrase backed up independently, and read [what is and is not
> verified](docs/DESIGN.md#what-is-verified).

![The phone app: welcome, accounts, reviewing a transfer, the code for the web app, and what it says](docs/img/phone.jpg)

- **Phone apps** (Android, iOS) hold your recovery phrase in memory only, refuse to run while
  any radio is on, and sign only transfers, after showing every recipient, amount and fee.
- **Web app** (a static site, also a browser extension) reads balances, prepares transfers for
  the phone to sign and broadcasts them. It holds addresses only: it never sees or creates a
  recovery phrase and cannot sign.
- The two talk through animated codes ([Lumen Code](https://github.com/atshelchin/lumen-code))
  that one screen shows and the other's camera reads. Every message is readable JSON
  ([protocol](docs/PROTOCOL.md)).

Networks: **Bitcoin** (BTC) and **Ethereum and EVM chains** (ETH and ERC-20 tokens on
Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Monad and 15 more EVM networks, their
testnets, and any chain you add).

![The web app: the total, split into Bunker and Exposed, and a transfer request shown to the phone](docs/img/web.jpg)

## Why

A quantum computer that breaks elliptic curves can recover a private key from its public key.
Mainstream hardware wallets give the computer public keys: Ledger with every address, Trezor's
extended key through MetaMask, QR wallets by syncing extended keys. Airkeys sends addresses only,
puts every account on its own hardened path, and by default moves what is left after a spend to a
fresh account in the same signing. See [Design](docs/DESIGN.md).

## Repository

```
docs/            PROTOCOL.md (the wire protocol), DESIGN.md (decisions, threat model, limits),
                 RECOVERY.md (getting your funds back without Airkeys)
registry/        networks.json — chains and tokens, shared by the phone's core and the web app
core/            Rust, shared by iOS and Android: every decision and computation
  wallet/          keys, addresses, transactions, protocol checks — pure functions
  app/             the Crux app (every screen and rule) + the runtime the shells call (uniffi)
  e2e/             signing and recovery checked against Bitcoin Core and an Ethereum fork
app-android/     Jetpack Compose shell
app-ios/         SwiftUI shell
app-web/         SvelteKit static site: landing page, web app, browser extension
store/           store listings, review notes, screenshots, and how a release is made
```

The shells draw the core's view and do what it asks (camera, screen). Every decision, such as
which screen comes next, what it says and what may be signed, is made in `core/`.

## Build

| What | Needs | Command |
|---|---|---|
| Core tests | Rust (pinned in `core/rust-toolchain.toml`) | `cd core && cargo test --workspace --release` |
| Android app | JDK 17 and 21, Android SDK + NDK, `cargo install cargo-ndk` | `cd app-android/Airkeys && ./gradlew :app:assembleRelease` |
| iOS app | Apple silicon, Xcode 26, `brew install xcodegen` | `core/scripts/build-ios.sh && cd app-ios && xcodegen && open Airkeys.xcodeproj` |
| Web app | [bun](https://bun.sh) (or npm) | `cd app-web/airkeys.app && bun install && bun run build` → `.svelte-kit/cloudflare/` |
| Browser extension | the same | `bun run extension` → `extension/` (load unpacked); each [release](https://github.com/mondaylabsltd/airkeys/releases) has it built |

airkeys.app runs on Cloudflare Workers (`bun run deploy`). Every page is prerendered, so to
self-host the web app, copy `.svelte-kit/cloudflare/` without `_worker.js` to any static host
over HTTPS (the camera needs it), and point its chain endpoints (in Settings) at your own nodes.

## Verification

CI runs the core, web and Android checks on every pull request; [CONTRIBUTING.md](CONTRIBUTING.md#checks)
lists them with the iOS tests. End-to-end checks run against Bitcoin Core regtest, an Ethereum
mainnet fork and the whole system in Chrome ([core/README.md](core/README.md),
[app-web/airkeys.app/README.md](app-web/airkeys.app/README.md)).
[What is verified](docs/DESIGN.md#what-is-verified) says what each check proves and what is
untested.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first; the wire protocol does not change within version
1. Report vulnerabilities privately ([SECURITY.md](SECURITY.md)). Changes are in
[CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
