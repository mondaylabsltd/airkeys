# Changelog

All notable changes to Airkeys. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/). The wire protocol has its own
version (`"airkeys": 1`, [docs/PROTOCOL.md](docs/PROTOCOL.md)), which changes only when a
message changes.

## [Unreleased]

### Added

- 23 EVM mainnets and 8 testnets, after Vela Wallet's list (Monad, Robinhood Chain, Arc, X
  Layer, Mantle, Gnosis, World Chain, Celo, Unichain, Ink, Soneium, Kaia, Stable, MegaETH,
  Plume, XRPL EVM and the testnets of the chains listed before), with their stablecoins,
  wrapped coins and best-known tokens; Chainlink prices for LINK, UNI, AAVE, stETH, CRV, MKR,
  COMP, PYUSD and EURC, and bridged stablecoins valued at par.
- About 300 tokens built in: on each network the tokens with the largest market caps (CoinGecko)
  whose address a second source (ethereum-data.getvela.app's token list, or Vela Wallet's)
  agrees on, symbol and decimals read from each contract.
- Tokens added by hand in Settings, found by name in ethereum-data.getvela.app's token list or
  by contract address; token and network logos from the same site.
- The web app reads balances again every minute while they are on screen, and when its page
  comes back into view.
- Bunker mode can be turned off in Settings, to use Airkeys as a plain cold wallet: a send moves
  only what is entered, receiving stays on one account, and Home asks nothing to move. With it
  on, Review shows what moving the rest adds to the fee.
- Accounts by page: the phone's wheel goes to #9999, and Connect shows the page of 100 that the
  wheel is on (#0 to #99, #100 to #199…), so a code still carries 100 accounts per network.
  Home asks for the next page, by number, before bunker mode runs out of unused accounts.
- Protocol: one Bitcoin output may return change to the paying account, named by its index or
  its address as §3 writes it; the phone names it as change back to this account. Any other
  spelling of the payer is still refused, and EVM transfers to the payer too. Phones before
  this refuse such a request; the message format is unchanged.

### Changed

- The web app's views are in the browser's history: Back and Forward move between them, and
  either network button leads to that network's Home.
- Balances are read through Multicall3, 1,000 per call and four calls at a time.
- A transfer request holds at most 16 transactions, as the phone requires; tokens past that
  stay for a second request, and Review says which.
- Home groups moves worth less than one unit of the currency; an account lists its assets by
  chain, most valuable first; Settings folds the other mode's networks away; on a computer the
  code fits the window with its buttons.

## [0.1.0] - 2026-10-27

### Added

- The phone apps (Android, iOS) on a shared Rust core: import a recovery phrase by typing or
  SeedQR, keep it in memory only, show addresses for accounts #0–#99, review and sign Bitcoin
  and EVM transfers (ETH and ERC-20), all behind an enforced air gap.
- The web app and browser extension: balances across Bitcoin and EVM chains, mainnet and
  testnet kept apart; transfer requests that move the rest to a fresh account (bunker mode) or
  leave it; broadcasting; networks added from ethereum-data.getvela.app.
- Full-screen Lumen Codes between the two; every message is readable JSON.
- Protocol v1, the design and threat model, and recovery without Airkeys ([docs/](docs/)).
- The web app opens on Home: the total, split into Bunker and Exposed; each exposed account's
  holdings per chain, with a Move button (everything on that chain to a fresh account, in one
  signing); every asset across accounts and chains, by worth. Prices from Chainlink feeds;
  other currencies through Vela's exchange-rate service.
- Before a first send on an EVM chain, the web app says what the account holds on the other
  EVM chains, where that send reveals the key too.
- airkeys.app, the landing page in English and Chinese: why addresses only, how it works,
  bunker mode, protections and threat model, networks, Android and iPhone, recovery, pricing,
  questions. Phone apps US$29.99 once on Google Play and the App Store, or free to build from
  source; the web companion free. Terms of Service and a Privacy Policy in both languages,
  linked from every page's footer.
- `store/`: the Google Play and App Store listings in English and Chinese, review notes,
  privacy and compliance answers, screenshots and graphics with the scripts that make them,
  and the release steps.
- A version tag makes a GitHub release with the browser extension attached; the site links to
  the latest one.

### Changed

- The Android status and navigation bars keep light icons on a phone in light mode, where they
  were dark on Airkeys' dark background.

- Every derivation path starts with Airkeys' own step `65738275'`
  (`m/65738275'/84'/0'/0'/0'/i'`, `m/65738275'/44'/60'/0'/0'/i'`), so no extended public key a
  standard wallet exported for the same phrase is an ancestor of an Airkeys account. Addresses
  derived earlier are on the old paths: move their funds first.

[Unreleased]: https://github.com/mondaylabsltd/airkeys/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mondaylabsltd/airkeys/releases/tag/v0.1.0
