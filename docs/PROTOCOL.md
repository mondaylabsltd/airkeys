# Airkeys Protocol v1

How the offline Airkeys phone and the online Airkeys web app talk. Status: **v1, normative.**

The phone holds the keys and never goes online. The web app knows the chains: it reads
balances, builds transfer requests and broadcasts signed transactions. They exchange three
kinds of JSON message over [Lumen Code](https://github.com/atshelchin/lumen-code), the
screen-to-camera transfer: one device shows an animated code, the other films it.

```
phone ── accounts ──► web        addresses only, never a public key
phone ◄──── sign ──── web        transfers to sign, in readable fields
phone ─── signed ───► web        raw transactions, ready to broadcast
```

## 1 · Why this protocol exists

A quantum computer that can break secp256k1 recovers a private key from its **public key**.
Bitcoin (P2WPKH) and Ethereum addresses are hashes of public keys, so a public key is only
revealed when its address first spends. Funds held at an address that
has never spent are out of reach.

Every mainstream way of connecting a cold wallet to a computer gives the computer more
than addresses: Ledger's `getAddress` returns the public key, MetaMask asks Trezor for an
xpub, Keystone syncs xpubs. Airkeys exposes **addresses and nothing else** until you decide
to spend, and keeps the rest of your funds hidden when you do.

## 2 · Rules every message follows

1. A message is one UTF-8 JSON object sent as a Lumen Code v1 file. The file name is
   `airkeys-<type>.json`. Receivers decide by the content, not the name.
2. Every message starts with `"airkeys": 1` (the protocol version) and `"type"`. A receiver
   rejects any other version.
3. **Money is a decimal string in base units** (satoshi, wei) with no sign,
   no exponent, no leading zeros: `"1500000"`. Counts and indices (index, nonce, vout,
   gas, chain id) are JSON integers.
4. Hex is lowercase without a `0x` prefix. EVM data uses a `0x` prefix: addresses, `raw`
   and `hash`. Addresses use each network's normal text form.
5. Receivers reject unknown fields and wrong types. A message is either valid in full or
   rejected in full. The phone never "repairs" a request.
6. A message is at most 1 MiB.

Any person can check a message with the standard Lumen Code receiver
([recv.html](https://lumencode.awesometools.dev/recv.html)). The JSON is meant to be read:
the phone sends no field that holds a key.

## 3 · Accounts and derivation

One recovery phrase (BIP-39, 12–24 words, optional passphrase) gives each network an
ordered list of accounts `#0, #1, #2, …`. **Every derivation step is hardened.**

| `network` | Path for index *i* | Address |
|---|---|---|
| `bitcoin` | `m/65738275'/84'/0'/0'/0'/i'` | P2WPKH, bech32 `bc1q…` |
| `evm` | `m/65738275'/44'/60'/0'/0'/i'` | `0x…`, EIP-55 checksum. One address for every EVM chain |

*i* is 0 to 2³¹−1. The path of a network and index is fixed by this table, so no message
carries a path. The phone offers accounts #0 to #99 to show and connect; a request may name
any index.

All steps are hardened for two reasons. There is no extended public key that could list
every address. And a child key broken through its exposed public key reveals nothing about
its parent or its siblings. That containment lets "spend from #0, move the rest to #1"
keep #1 safe.

The first step, `65738275'`, is "AIRK" in ASCII decimal codes (as BIP-85 writes "SEED" as
`83696968'`). No standard wallet derives under it. A wallet that imported the same phrase may
have handed out the extended public key of `m/44'/60'/0'` or `m/84'/0'/0'`; neither is an
ancestor of an Airkeys account, so breaking it reaches none of them.

An **account reference** names an address in a message:

```json
{ "address": "bc1q…" }                 // any address
{ "index": 1 }                         // this wallet's account #1; the phone derives the address
{ "index": 1, "address": "bc1q…" }     // both; the phone checks that they match
```

## 4 · `accounts` — phone → web

The phone shares the accounts the person selects: one account number, or all of them (#0 to
#99), on one or both networks.

```json
{
  "airkeys": 1,
  "type": "accounts",
  "accounts": [
    { "network": "bitcoin", "index": 0, "address": "bc1qvuapkt7kdu4vnrfttvzmszuj8cfdnedsch0hy3" },
    { "network": "evm", "index": 0, "address": "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158" }
  ]
}
```

`accounts` holds 1–200 entries. The address in each entry is the only key-related value.
The phone shares accounts a page at a time: #0 to #99, #100 to #199 and so on, up to #9999.
A page on both networks makes a 17 KB message (about 9 KB compressed), which the code carries
in several frames.
(The examples in this document use the accounts of the test phrase
`abandon abandon … abandon about`.)

## 5 · `sign` — web → phone

One request spends from one account on one network:

```json
{
  "airkeys": 1,
  "type": "sign",
  "id": "c0ffee01",
  "network": "evm",
  "from": { "index": 0, "address": "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158" },
  …network fields…
}
```

- `id`: 1–64 characters `[A-Za-z0-9_-]`. It is chosen by the web and returned in `signed`.
- `from`: `index` and `address`, both required. If the derived address is different, the
  phone refuses: the request is for another wallet or another passphrase.

The phone **builds every byte it signs** from these fields. A request cannot carry raw
transaction bytes, calldata, scripts or instructions, so the phone can sign only transfers.
What the phone shows is what it signs.

### 5.1 · Bitcoin

```json
{
  "airkeys": 1, "type": "sign", "id": "c0ffee02",
  "network": "bitcoin",
  "from": { "index": 0, "address": "bc1qvuapkt7kdu4vnrfttvzmszuj8cfdnedsch0hy3" },
  "inputs": [
    { "txid": "8c14…", "vout": 1, "amount": "150000", "prevTx": "02000000000101…" }
  ],
  "outputs": [
    { "to": { "address": "bc1p…" }, "amount": "50000" },
    { "to": { "index": 1 }, "amount": "98590" }
  ]
}
```

- `inputs` (1–200): coins of `from`. `prevTx` is the whole previous transaction in hex. The
  phone checks that its txid is `txid` and that output `vout` pays exactly `amount` to the
  script of `from`. The full previous transaction stops the segwit-v0 fee attack: without
  it, an input amount is only a claim.
- `outputs` (1–16): `to` is any mainnet P2PKH, P2SH, P2WPKH, P2WSH or P2TR address, or an
  account of this wallet (change). At most one output may return change to `from` itself,
  named by `{ "index": from.index }` or by its address as §3 writes it: a wallet kept as a plain
  cold wallet keeps its coins on one account. The phone names it as change back to this
  account; the coins then sit at an address whose key the spend reveals, which the review
  says. `from` in any other spelling (upper case, the legacy or nested form of its key) is
  refused. Each amount must meet the dust limit:
  294 sat for P2WPKH, 330 for P2WSH or P2TR, 540 for P2SH, 546 for P2PKH.
- The fee is the inputs minus the outputs. It must be positive.
- The phone fixes everything else: version 2, lock time 0, sequence `0xfffffffd`
  (replaceable), outputs in request order, and `SIGHASH_ALL` signatures under BIP-143.

### 5.2 · EVM

```json
{
  "airkeys": 1, "type": "sign", "id": "c0ffee03",
  "network": "evm",
  "chainId": 1,
  "from": { "index": 0, "address": "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158" },
  "txs": [
    {
      "to": { "address": "0x8617E340B3D01FA5F11F306F4090FD50E238070D" },
      "amount": "100000000",
      "token": { "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "symbol": "USDC", "decimals": 6 },
      "nonce": 7, "gas": 65000,
      "maxFeePerGas": "30000000000", "maxPriorityFeePerGas": "1000000000"
    },
    {
      "to": { "index": 1 },
      "amount": "480000000000000000",
      "nonce": 8, "gas": 21000,
      "maxFeePerGas": "30000000000", "maxPriorityFeePerGas": "30000000000"
    }
  ]
}
```

- `chainId` binds every transaction to one chain (EIP-155).
- `txs` (1–16): each element is one transaction that makes one transfer. `nonce`s are
  consecutive in list order.
- Without `token`, the transaction sends the native coin. With `token`, it calls
  `transfer(to, amount)` on `token.address`: value 0, data `a9059cbb ‖ to ‖ amount`
  (ABI-encoded, 32 bytes each).
- Fees use EIP-1559 (`maxFeePerGas` and `maxPriorityFeePerGas`, with
  `maxPriorityFeePerGas ≤ maxFeePerGas`, type-2 transaction), or the legacy `gasPrice`
  (EIP-155 transaction). A transaction uses one of the two forms. Access lists are always
  empty.

### 5.3 · Tokens

A `token` names its ERC-20 contract with `address`, plus `symbol` and `decimals`. The phone holds a list of well-known tokens: [`registry/networks.json`](../registry/networks.json).

- A listed token must match the list exactly, or the phone refuses the request.
- An unlisted token is signed only after the person sees a warning that names the
  contract and says that the symbol and decimals come from the web app.

## 6 · `signed` — phone → web

```json
{
  "airkeys": 1,
  "type": "signed",
  "id": "c0ffee03",
  "network": "evm",
  "txs": [
    { "hash": "0x5c50…", "raw": "0x02f8b1…" },
    { "hash": "0x9e1d…", "raw": "0x02f872…" }
  ],
  "accounts": [ { "network": "evm", "index": 1, "address": "0xEA373B5359e70C7fE76d048fdfe435f6b910Ccd8" } ]
}
```

- `txs` lists the signed transactions in request order. Bitcoin has exactly one.
- `accounts` lists every account that the request named by `index` alone, so the web can
  track the account that now holds the change. It is left out when the list is empty.

| `network` | `hash` | `raw` | Broadcast with |
|---|---|---|---|
| `bitcoin` | txid (hex, display order) | transaction hex, with witness | `POST /tx` (Esplora) |
| `evm` | `0x` + Keccak-256 of `raw` | `0x` + typed or legacy transaction | `eth_sendRawTransaction` |

Signatures are deterministic (RFC 6979, low *s*): the same request always gives the same
`signed` message.

The signatures in `signed` reveal the public key of `from` to anyone who has the message,
just as broadcasting does. Airkeys says this on the phone before you sign.

## 7 · What the phone checks before it shows a request

The phone refuses a request when any of these is false:

1. The JSON is valid under §2 and §5, and every address parses for its network
   (EIP-55 checksums must be correct when mixed case is used). Addresses longer than 90
   characters and amounts longer than 78 digits are refused before they are read.
2. `from.address` is the address that the phone derives for `from.index`, spelled exactly as
   §3 writes it (checksummed EVM, lowercase bech32).
3. Every `{ "index", "address" }` reference matches the derivation, spelled the same way.
4. No transfer pays `from`, however it is written: an EVM address in any case; a Bitcoin
   address in any case, or as the legacy (P2PKH) or nested (P2SH-P2WPKH) form of the same key.
   The one exception is a Bitcoin output returning change to `from`, written as §5.1 allows,
   at most once.
5. Bitcoin: each `prevTx` has the stated txid and pays `amount` to `from`; every output meets
   the dust limit; the fee is positive.
6. EVM: every amount is above zero; every gas limit is at least 21 000; nonces are consecutive
   (and do not wrap); `maxPriorityFeePerGas ≤ maxFeePerGas`.
7. Listed tokens match the list (§5.3). Any token's symbol is 1–16 printable ASCII
   characters and its decimals at most 36.

The phone shows these as warnings, and the person can still sign:

- an unlisted token, or an EVM chain that is not in the list (only its chain id is shown);
- a listed test network (Sepolia) is labelled "Testnet": its coins have no value;
- a Bitcoin fee above 5 % of what is paid to others (change excluded; of everything when it
  all stays in the wallet), or above 1 000 sat/vB;
- an EVM maximum fee above 5 % of the native coin paid to others, or a price per gas above
  1 000 gwei on any chain (moves to the wallet's own accounts are not a payment);
- the public key of `from` becomes known when this transaction is broadcast.

The phone always shows the network, the chain, every recipient, every amount and the
maximum fee.

## 8 · Versioning

`"airkeys": 1` is the version. Receivers reject unknown fields (§2), so a new field, like
any change an old receiver would misunderstand, needs a new version number.
