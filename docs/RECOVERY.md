# Recovering funds without Airkeys

Airkeys keeps nothing: your recovery phrase (and passphrase, if you set one) is all you need,
read with standard BIP-39 and derived with standard BIP-32 / SLIP-0010. Only the paths are
unusual. They start with Airkeys' own step `65738275'` ([why](DESIGN.md#a-path-of-its-own)) and
every step is hardened ([why](DESIGN.md#every-derivation-step-hardened)), so a wallet that
imports the phrase with its default paths shows other, empty addresses. Any tool that takes a
full derivation path with hardened steps finds yours:

| Network | Account *i* |
|---|---|
| Bitcoin | `m/65738275'/84'/0'/0'/0'/i'` — native SegWit (P2WPKH, `bc1q…`) |
| Ethereum and EVM chains | `m/65738275'/44'/60'/0'/0'/i'` — the same address on every chain |

Before you start:

- Work on a computer you trust, offline while you type the phrase.
- Check that the first address a tool shows is the one Airkeys showed for that account. A typo,
  a forgotten passphrase or a wrong path gives a different, valid, empty wallet.
- A key that has been on an online computer is out of the bunker: once recovered, move the funds.

Every recipe below is tested by [`core/e2e/recovery.mjs`](../core/e2e/recovery.mjs) with the
tools named (Bitcoin Core 31.1, Foundry `cast` 1.5). They derive exactly the addresses Airkeys
shows, with and without a passphrase, and on Bitcoin a recovered wallet sweeps coins on
regtest.

## Bitcoin — Bitcoin Core

You need a synced, unpruned Bitcoin Core node and the phrase's root key (`xprv…`). This
script prints the root key using only Python's standard library; read it first:

```python
# Prints the BIP-32 root key (xprv) of a recovery phrase. Python 3 standard library only.
import getpass, hashlib, hmac, unicodedata

nfkd = lambda s: unicodedata.normalize("NFKD", s)
phrase = nfkd(" ".join(getpass.getpass("Recovery phrase: ").split()))
passphrase = nfkd(getpass.getpass("Passphrase (Enter if none): "))
seed = hashlib.pbkdf2_hmac("sha512", phrase.encode(), b"mnemonic" + passphrase.encode(), 2048)
i = hmac.new(b"Bitcoin seed", seed, "sha512").digest()
key = bytes.fromhex("0488ade4") + bytes(9) + i[32:] + b"\0" + i[:32]
key += hashlib.sha256(hashlib.sha256(key).digest()).digest()[:4]
n, out = int.from_bytes(key, "big"), ""
while n:
    n, r = divmod(n, 58)
    out = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[r] + out
print(out)
```

Then, with the key in place of `XPRV`:

```sh
bitcoin-cli -named createwallet wallet_name=airkeys blank=true
bitcoin-cli getdescriptorinfo "wpkh(XPRV/65738275h/84h/0h/0h/0h/*h)"          # note its "checksum"
bitcoin-cli -rpcwallet=airkeys importdescriptors \
  '[{"desc": "wpkh(XPRV/65738275h/84h/0h/0h/0h/*h)#CHECKSUM", "timestamp": 0, "range": [0, 99]}]'
bitcoin-cli deriveaddresses "wpkh(XPRV/65738275h/84h/0h/0h/0h/*h)#CHECKSUM" "[0,1]"   # compare
bitcoin-cli -rpcwallet=airkeys getbalance
bitcoin-cli -rpcwallet=airkeys sendall '["bc1q…your new address"]'
```

`importdescriptors` rescans the chain for accounts 0–99. If your wallet used accounts past #99
(the phone's Connect showed you a later page, such as #100 to #199), raise the end of the range
to cover them, for example `[0, 999]`. From `"timestamp": 0` this is slow; a Unix time shortly
before your first deposit is faster. `sendall` sweeps every coin of every account.

## Ethereum and EVM chains — `cast`, then any wallet

[Foundry](https://getfoundry.sh)'s `cast` derives the private key of any path. The commands
below are for account #0. For account *i*, end the path with `i'`; if you set a passphrase, add
`--mnemonic-passphrase "$PASS"`:

```sh
read -rs PHRASE                       # type the phrase; nothing is shown or kept in history
cast wallet address     --mnemonic "$PHRASE" --mnemonic-derivation-path "m/65738275'/44'/60'/0'/0'/0'"
cast wallet private-key --mnemonic "$PHRASE" --mnemonic-derivation-path "m/65738275'/44'/60'/0'/0'/0'"
```

The first command prints the address; compare it. Then import the private key into MetaMask,
Rabby or any EVM wallet ("Import account"). It controls the account on every EVM chain, ERC-20
tokens included.
