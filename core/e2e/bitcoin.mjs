// Bitcoin end to end: a regtest Bitcoin Core node validates what the phone signs.
// Account #0 receives three coins (in segwit transactions, so `prevTx` carries witnesses);
// the phone spends all of them to a P2TR, a P2PKH and a P2SH recipient, with the change to
// account #1; then account #1 pays with its change coming back to itself, as a plain cold
// wallet does. The node must accept both (testmempoolaccept, then a block), and refused
// requests must be refused — the fee-attack one above all.
//
//   BITCOIND=/path/to/bitcoind node e2e/bitcoin.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { address, base58check, buildSigner, check, done, phone, phoneRefuses, segwitAddress, segwitProgram, start, unbase58check } from './lib.mjs';

const BITCOIND = process.env.BITCOIND ?? 'bitcoind';
const PORT = 18555;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airkeys-regtest-'));
const node = async (method, ...params) => {
	const r = await fetch(`http://127.0.0.1:${PORT}/${method === 'sendtoaddress' || method === 'getnewaddress' ? 'wallet/miner' : ''}`, {
		method: 'POST',
		headers: { authorization: 'Basic ' + Buffer.from('a:b').toString('base64') },
		body: JSON.stringify({ jsonrpc: '1.0', id: 1, method, params }),
	});
	const j = await r.json();
	if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
	return j.result;
};
// the same script, spelled for mainnet (what the phone speaks) or regtest (what the node speaks)
const toMain = (a) => {
	if (a.startsWith('bcrt1')) {
		const { version, program } = segwitProgram(a);
		return segwitAddress('bc', version, program);
	}
	const p = unbase58check(a);
	return base58check(Buffer.concat([Buffer.from([p[0] === 0x6f ? 0x00 : 0x05]), p.subarray(1)]));
};
const toRegtest = (a) => {
	const { version, program } = segwitProgram(a);
	return segwitAddress('bcrt', version, program);
};
const sats = (btc) => Math.round(btc * 1e8);

buildSigner();
const bitcoind = await start(BITCOIND, ['-regtest', `-datadir=${dir}`, `-rpcport=${PORT}`, '-rpcuser=a', '-rpcpassword=b', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole'], 'init message: Done loading');
try {
	await node('createwallet', 'miner');
	const mine = async (n) => node('generatetoaddress', n, await node('getnewaddress'));
	await mine(101);

	const a0 = address('bitcoin', 0);
	const a1 = address('bitcoin', 1);
	console.log(`account #0 ${a0}\naccount #1 ${a1}`);
	for (const btc of [0.5, 0.3, 0.2]) await node('sendtoaddress', toRegtest(a0), btc);
	await mine(1);
	const scan = await node('scantxoutset', 'start', [`addr(${toRegtest(a0)})`]);
	check(scan.unspents.length === 3, 'account #0 holds three coins');
	const inputs = [];
	for (const u of scan.unspents) inputs.push({ txid: u.txid, vout: u.vout, amount: String(sats(u.amount)), prevTx: await node('getrawtransaction', u.txid) });
	check(inputs.every((i) => i.prevTx.slice(8, 12) === '0001'), 'the previous transactions are segwit (with witnesses)');

	const taproot = toMain(await node('getnewaddress', '', 'bech32m'));
	const legacy = toMain(await node('getnewaddress', '', 'legacy'));
	const p2sh = toMain(await node('getnewaddress', '', 'p2sh-segwit'));
	const total = inputs.reduce((s, i) => s + Number(i.amount), 0);
	const fee = 300 * 5; // about 300 vB at 5 sat/vB
	const pay = [[taproot, 40_000_000], [legacy, 10_000_000], [p2sh, 5_000_000]];
	const change = total - fee - pay.reduce((s, p) => s + p[1], 0);
	const request = {
		airkeys: 1, type: 'sign', id: 'btc-spend-all', network: 'bitcoin',
		from: { index: 0, address: a0 },
		inputs,
		outputs: [...pay.map(([a, v]) => ({ to: { address: a }, amount: String(v) })), { to: { index: 1 }, amount: String(change) }],
	};
	const signed = phone([], request);
	check(signed.txs.length === 1 && signed.accounts?.[0]?.address === a1, 'the phone signs one transaction and reports account #1');
	const [accept] = await node('testmempoolaccept', [signed.txs[0].raw]);
	check(accept.allowed === true, `Bitcoin Core accepts it (${accept['reject-reason'] ?? `vsize ${accept.vsize}, fee ${accept.fees?.base} BTC`})`);
	check(accept.txid === signed.txs[0].hash, 'the node computes the same txid');
	const txid = await node('sendrawtransaction', signed.txs[0].raw);
	await mine(1);
	const tx = await node('getrawtransaction', txid, true);
	check(tx.confirmations === 1, 'mined in a block');
	check(tx.vin.every((v) => v.sequence === 0xfffffffd) && tx.version === 2 && tx.locktime === 0, 'version 2, lock time 0, replaceable');
	const outs = tx.vout.map((o) => [toMain(o.scriptPubKey.address), sats(o.value)]);
	check(JSON.stringify(outs) === JSON.stringify([...pay, [a1, change]]), 'outputs: P2TR, P2PKH, P2SH recipients, then change to account #1');
	const left = await node('scantxoutset', 'start', [`addr(${toRegtest(a0)})`]);
	check(left.unspents.length === 0, 'account #0 is empty: nothing stays at the exposed address');

	// a plain cold wallet: account #1 pays, and its change comes back to account #1
	const prevTx = await node('getrawtransaction', txid, false);
	const fee2 = 200 * 5;
	const paid = 1_000_000;
	const kept = change - paid - fee2;
	const coldRequest = {
		airkeys: 1, type: 'sign', id: 'btc-change-back', network: 'bitcoin',
		from: { index: 1, address: a1 },
		inputs: [{ txid, vout: 3, amount: String(change), prevTx }],
		outputs: [{ to: { address: taproot }, amount: String(paid) }, { to: { index: 1 }, amount: String(kept) }],
	};
	const cold = phone([], coldRequest);
	check(cold.txs.length === 1 && !(cold.accounts ?? []).length, 'the phone signs change back to the paying account, reporting no new account');
	const [coldAccept] = await node('testmempoolaccept', [cold.txs[0].raw]);
	check(coldAccept.allowed === true, `Bitcoin Core accepts it (${coldAccept['reject-reason'] ?? `vsize ${coldAccept.vsize}`})`);
	await node('sendrawtransaction', cold.txs[0].raw);
	await mine(1);
	const stays = await node('scantxoutset', 'start', [`addr(${toRegtest(a1)})`]);
	check(stays.unspents.length === 1 && sats(stays.unspents[0].amount) === kept, 'mined: the change sits on account #1 again');

	// what the phone refuses
	const lie = structuredClone(request);
	lie.inputs[0].amount = String(Number(lie.inputs[0].amount) - 10_000);
	check(/holds \d+ sat/.test(phoneRefuses(lie)), 'refuses an input amount that its previous transaction contradicts (fee attack)');
	const swap = structuredClone(request);
	swap.inputs[0].prevTx = request.inputs[1].prevTx;
	check(/previous transaction is not/.test(phoneRefuses(swap)), 'refuses a previous transaction with another txid');
	const back = structuredClone(request);
	back.outputs[3].to = { address: a0.toUpperCase() };
	check(/goes back to the account that pays/.test(phoneRefuses(back)), 'refuses the paying address in another spelling');
	const twice = structuredClone(request);
	twice.outputs[2].to = { index: 0 };
	twice.outputs[3].to = { address: a0 };
	check(/Two outputs return change/.test(phoneRefuses(twice)), 'refuses change back to the payer twice');
	const dust = structuredClone(request);
	dust.outputs[0].amount = '329';
	check(/dust/.test(phoneRefuses(dust)), 'refuses an output below the dust limit');
	const nofee = structuredClone(request);
	nofee.outputs[3].amount = String(change + fee);
	check(/no fee/.test(phoneRefuses(nofee)), 'refuses a transaction without a fee');
	const testnet = structuredClone(request);
	testnet.outputs[0].to.address = toRegtest(a1);
	check(/mainnet/.test(phoneRefuses(testnet)), 'refuses a non-mainnet address');
	const notOurs = structuredClone(request);
	notOurs.from = { index: 1, address: a1 };
	notOurs.outputs[3].to = { index: 2 };
	check(/does not belong to account #1/.test(phoneRefuses(notOurs)), 'refuses coins of another account');
} finally {
	bitcoind.kill();
	fs.rmSync(dir, { recursive: true, force: true });
}
done();
