//! Bytes per frame of the phone's code at each grid size, and what real messages need: the
//! accounts of one account number, and of a page of 100 (`PAGE`), on both networks; signed
//! replies of one transaction and of many. For each, the frames a reader needs at each grid
//! when it catches every frame (the sender's real schedule, into a real receiver).
use airkeys::app::PAGE;
use airkeys_wallet::protocol::{Account, Message, Signed, SignedTx};
use airkeys_wallet::{Mnemonic, Network, Wallet};
use lumen::transfer::{Receiver, Sender, prepare};

const SIDES: [usize; 7] = [44, 52, 60, 72, 84, 100, 120];

/// Frames until the message is read, catching every frame.
fn frames(json: &str, side: usize) -> usize {
    let p = prepare(json.as_bytes(), "m.json", true);
    let mut tx = Sender::new(&p, 1, 2, side, side, 0x2a2a, 0).unwrap();
    let mut rx = Receiver::new();
    for n in 1..=500 {
        for packet in tx.next_packets() {
            rx.push(&packet);
        }
        if rx.try_finish().is_some() {
            return n;
        }
    }
    unreachable!("not read in 500 frames")
}

/// Hex that does not compress, as a signature's and a hash's do not.
fn hex(len: usize, seed: &mut u64) -> String {
    let mut s = String::from("0x");
    for _ in 0..len {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 7;
        *seed ^= *seed << 17;
        s.push_str(&format!("{:02x}", *seed as u8));
    }
    s
}

fn main() {
    let probe = prepare(&[0u8; 64], "p", false);
    for side in SIDES {
        let s = Sender::new(&probe, 1, 2, side, side, 0, 0).unwrap();
        println!("{side}x{side} (4 colours, 22% parity): {:5} B per frame", s.bytes_per_frame());
    }
    let phrase =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let w = Wallet::new(&Mnemonic::parse(phrase).unwrap().seed("").unwrap()).unwrap();
    let mut messages = Vec::new();
    for (what, indexes) in [("account #7", 7..8), ("accounts #0-#99", 0..PAGE)] {
        let accounts = indexes
            .flat_map(|i| {
                Network::ALL.map(|network| Account {
                    network,
                    index: i,
                    address: w.address(network, i).unwrap(),
                })
            })
            .collect();
        messages.push((format!("{what}, both networks"), Message::Accounts(accounts).to_json()));
    }
    // an ERC-20 transfer signed is about 110 bytes, an Ethereum transfer a little less
    let mut seed = 0x9e37_79b9_7f4a_7c15;
    for n in [1, 3, 16] {
        let txs = (0..n).map(|_| SignedTx { hash: hex(32, &mut seed), raw: hex(112, &mut seed) }).collect();
        let signed = Signed { id: "3f9a1c07d2e4b851".into(), network: Network::Evm, txs, accounts: vec![] };
        messages.push((format!("signed, {n} EVM transaction(s)"), Message::Signed(signed).to_json()));
    }
    print!("\n{:40} {:>6} {:>6}", "frames to read, catching every frame", "JSON", "sent");
    for side in SIDES {
        print!(" {side:>4}");
    }
    println!();
    for (what, json) in &messages {
        let p = prepare(json.as_bytes(), "m.json", true);
        print!("{what:40} {:>6} {:>6}", json.len(), p.payload.len());
        for side in SIDES {
            print!(" {:>4}", frames(json, side));
        }
        println!();
    }
}
