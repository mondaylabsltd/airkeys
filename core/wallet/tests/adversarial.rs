//! Requests a hostile web app could send, from an independent audit of the review: each must
//! be refused or flagged, quickly, and never crash the phone.

use airkeys_wallet::protocol::{Message, SignRequest};
use airkeys_wallet::{Mnemonic, Wallet, bitcoin, review};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;

const PHRASE: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const BTC0: &str = "bc1qvuapkt7kdu4vnrfttvzmszuj8cfdnedsch0hy3";
const EVM0: &str = "0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158";
const FOREIGN_BTC: &str = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const FOREIGN_EVM: &str = "0x000000000000000000000000000000000000dEaD";

fn wallet() -> Wallet {
    Wallet::new(&Mnemonic::parse(PHRASE).unwrap().seed("").unwrap()).unwrap()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn sha256d(b: &[u8]) -> [u8; 32] {
    Sha256::digest(Sha256::digest(b)).into()
}

/// A previous transaction paying `outputs`, as the phone parses it.
fn prev_tx(outputs: &[(u64, Vec<u8>)]) -> (String, String) {
    let mut t = vec![2, 0, 0, 0, 1];
    t.extend_from_slice(&[7; 32]);
    t.extend_from_slice(&[0, 0, 0, 0, 0]);
    t.extend_from_slice(&[0xff; 4]);
    t.push(outputs.len() as u8);
    for (v, s) in outputs {
        t.extend_from_slice(&v.to_le_bytes());
        t.push(s.len() as u8);
        t.extend_from_slice(s);
    }
    t.extend_from_slice(&[0; 4]);
    let mut id = sha256d(&t);
    id.reverse();
    (hex(&t), hex(&id))
}

fn request(v: Value) -> SignRequest {
    match Message::parse(v.to_string().as_bytes()).unwrap() {
        Message::Sign(r) => r,
        _ => panic!("not a sign request"),
    }
}

/// Account #0 spends one coin of `value` sat to `outputs`.
fn btc(value: u64, outputs: Value) -> SignRequest {
    let (raw, txid) = prev_tx(&[(value, bitcoin::parse_address(BTC0).unwrap().script)]);
    request(json!({"airkeys":1,"type":"sign","id":"x","network":"bitcoin","from":{"index":0,"address":BTC0},
        "inputs":[{"txid":txid,"vout":0,"amount":value.to_string(),"prevTx":raw}],"outputs":outputs}))
}

fn evm(txs: Value) -> SignRequest {
    request(
        json!({"airkeys":1,"type":"sign","id":"x","network":"evm","chainId":1,"from":{"index":0,"address":EVM0},"txs":txs}),
    )
}

fn eth(to: Value, amount: &str, nonce: u64, max_fee: &str) -> Value {
    json!({"to":to,"amount":amount,"nonce":nonce,"gas":21000,"maxFeePerGas":max_fee,"maxPriorityFeePerGas":"1000000000"})
}

fn refusal(r: &SignRequest) -> String {
    match review(r, &wallet()) {
        Ok(_) => panic!("signed a request it must refuse"),
        Err(e) => e.en,
    }
}

#[test]
fn odd_characters_in_an_address_are_refused_not_a_crash() {
    for address in ["a€", "1é€", "bc€1q", "bc1\u{202e}q"] {
        let e = refusal(&btc(100_000, json!([{"to":{"address":address},"amount":"50000"}])));
        assert!(e.contains("not a valid Bitcoin address"), "{e}");
        assert!(!e.contains('\u{202e}'), "no direction override reaches the screen");
    }
}

#[test]
fn a_huge_address_is_refused_at_once_with_a_short_message() {
    for address in [format!("1{}", "z".repeat(500_000)), format!("0x{}", "a".repeat(500_000))] {
        let r = if address.starts_with('1') {
            btc(100_000, json!([{"to":{"address":address},"amount":"50000"}]))
        } else {
            evm(json!([eth(json!({"address":address}), "1", 0, "1000000000")]))
        };
        let t = Instant::now();
        let e = refusal(&r);
        // it once took minutes; a slow CI machine still answers well within this
        assert!(t.elapsed().as_millis() < 2_000, "took {:?}", t.elapsed());
        assert!(e.chars().count() < 200, "the message quotes the address in full: {} characters", e.len());
    }
}

#[test]
fn text_from_a_request_reaches_the_screen_cleaned() {
    // a direction override and a control character, padded long
    let hostile = format!("\u{202e}evil\u{0}{}", "x".repeat(5_000));
    let clean = |e: &str| {
        assert!(e.chars().count() < 200, "{} characters", e.chars().count());
        assert!(!e.contains('\u{202e}') && !e.contains('\u{0}'), "{e:?}");
    };
    // the message type, an unknown field's name
    for message in [json!({"airkeys":1,"type":hostile}), json!({"airkeys":1,"type":"signed",&hostile:1})] {
        clean(&Message::parse(message.to_string().as_bytes()).unwrap_err().to_string());
    }
    // a token's symbol
    let token = json!({"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","symbol":hostile,"decimals":6});
    let tx = json!({"to":{"address":FOREIGN_EVM},"amount":"1","token":token,"nonce":0,"gas":65000,
        "maxFeePerGas":"1000000000","maxPriorityFeePerGas":"1000000000"});
    clean(&refusal(&evm(json!([tx]))));
}

#[test]
fn paying_the_payer_back_is_refused_however_it_is_spelled() {
    // (Bitcoin change back to the payer, written as §3 writes it, is allowed: see below)
    // EVM: any case of the paying address
    for spelling in [EVM0.to_lowercase(), format!("0x{}", EVM0[2..].to_uppercase())] {
        let e = refusal(&evm(json!([eth(json!({"address":spelling}), "1000", 0, "1000000000")])));
        assert!(e.contains("goes back to the account that pays"), "{spelling}: {e}");
    }
    // Bitcoin: upper case, and the legacy and nested forms of the same key
    let own = bitcoin::parse_address(BTC0).unwrap().script;
    let hash = &own[2..];
    let b58 = |version: u8, h: &[u8]| bs58::encode([&[version][..], h].concat()).with_check().into_string();
    let hash160 = |b: &[u8]| -> Vec<u8> {
        use ripemd::{Digest as _, Ripemd160};
        Ripemd160::digest(Sha256::digest(b)).to_vec()
    };
    for spelling in [BTC0.to_uppercase(), b58(0x00, hash), b58(0x05, &hash160(&own))] {
        let e = refusal(&btc(
            100_000,
            json!([{"to":{"address":FOREIGN_BTC},"amount":"40000"},{"to":{"address":spelling},"amount":"50000"}]),
        ));
        assert!(e.contains("goes back to the account that pays"), "{spelling}: {e}");
    }
}

#[test]
fn bitcoin_change_may_come_back_to_the_payer_once_and_only_as_written() {
    // a plain cold wallet keeps its coins on one account: the change named by the paying
    // account's index, or by its address exactly as §3 writes it
    for back in [json!({"index":0}), json!({"address":BTC0}), json!({"index":0,"address":BTC0})] {
        let r = review(
            &btc(
                100_000,
                json!([{"to":{"address":FOREIGN_BTC},"amount":"40000"},{"to":back,"amount":"59000"}]),
            ),
            &wallet(),
        )
        .unwrap_or_else(|e| panic!("{back}: {}", e.en));
        let change = &r.transfers[1];
        assert_eq!((change.own, change.to.as_str()), (Some(0), BTC0), "{back}");
        assert_eq!(change.note.as_ref().unwrap().en, "Change, back to this account");
        // the fee is weighed against what is paid away, not against the change
        assert!(r.warnings.is_empty(), "{:?}", r.warnings);
    }
    // twice is not change
    let e = refusal(&btc(
        100_000,
        json!([{"to":{"index":0},"amount":"40000"},{"to":{"address":BTC0},"amount":"50000"}]),
    ));
    assert!(e.contains("Two outputs return change"), "{e}");
    // EVM has no change: paying the payer back stays refused, by index too
    let e = refusal(&evm(json!([eth(json!({"index":0}), "1000", 0, "1000000000")])));
    assert!(e.contains("goes back to the account that pays"), "{e}");
}

#[test]
fn a_fee_above_the_payment_is_flagged_even_with_change() {
    // 1 BTC coin: 100 000 sat paid, 140 000 sat fee, the rest as change to account #1
    let r = btc(
        100_000_000,
        json!([{"to":{"address":FOREIGN_BTC},"amount":"100000"},{"to":{"index":1},"amount":"99760000"}]),
    );
    let warnings = review(&r, &wallet()).unwrap().warnings;
    assert!(warnings.iter().any(|w| w.en.contains("fee is high")), "{warnings:?}");
}

#[test]
fn an_evm_fee_is_weighed_against_what_is_paid_not_moved() {
    // 0.01 ETH paid with up to 0.4 ETH in fees, beside a 9 ETH move to account #1
    let price = "19047619047619"; // × 21 000 gas ≈ 0.4 ETH
    let r = evm(json!([
        eth(json!({"address":FOREIGN_EVM}), "10000000000000000", 0, price),
        eth(json!({"index":1}), "9000000000000000000", 1, "1000000000"),
    ]));
    let warnings = review(&r, &wallet()).unwrap().warnings;
    assert!(warnings.iter().any(|w| w.en.contains("fee is high")), "{warnings:?}");
    // a token payment pays no native coin: an absurd price per gas is flagged all the same
    let usdc = json!({"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","symbol":"USDC","decimals":6});
    let r = evm(json!([{"to":{"address":FOREIGN_EVM},"amount":"5000000","token":usdc,"nonce":0,"gas":65000,
        "maxFeePerGas":"15384615384615","maxPriorityFeePerGas":"1000000000"}]));
    let warnings = review(&r, &wallet()).unwrap().warnings;
    assert!(
        warnings.iter().any(|w| w.en.contains("fee is high")),
        "a 1 ETH fee on a token transfer: {warnings:?}"
    );
}

#[test]
fn nonces_cannot_repeat_at_the_top() {
    let max = u64::MAX;
    let r = evm(json!([
        eth(json!({"address":FOREIGN_EVM}), "1", max, "1000000000"),
        eth(json!({"address":FOREIGN_EVM}), "1", max, "1000000000"),
    ]));
    assert!(refusal(&r).contains("consecutive"));
}
