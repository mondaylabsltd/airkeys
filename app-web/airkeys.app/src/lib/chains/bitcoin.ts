// Bitcoin over an Esplora API (mempool.space by default): balances, whether the key is exposed,
// transfer requests (§5.1), broadcasting.
//
// A spend reveals the public key of the account it spends from, so a request spends every coin
// of the account: what is not paid goes as change to a fresh account (bunker mode), or back to
// the same account (a plain cold wallet, `moveRest` its own number).
import { BTC_DUST, BTC_OUTPUT_BYTES, parseBitcoin, paysSameKey } from '../addresses';
import { encode, MAX_MESSAGE, signRequest } from '../protocol';
import { formatUnits } from '../units';
import type { Chain } from '../registry';
import { t } from '../i18n/index.svelte';
import {
	getJson,
	getText,
	mapLimit,
	own,
	postText,
	type Asset,
	type Broadcast,
	type Prepared,
	type SendIntent
} from './net';

interface Stats {
	funded_txo_count: number;
	funded_txo_sum: number;
	spent_txo_sum: number;
	spent_txo_count: number;
}

/** Requests in flight at once to an Esplora API: public servers limit request rates. */
export const PARALLEL = 3;
/** The most coins one request spends (PROTOCOL §5.1). */
const MAX_INPUTS = 200;

/** APIs that failed recently, until when: the other one is asked first meanwhile. */
const down = new Map<string, number>();

/** Asks the Esplora API, and the fallback API when the first fails. One that fails is asked
 * last for five minutes, so a server that stopped answering costs one timeout, not one per
 * request. */
async function esplora<T>(chain: Chain, call: (api: string) => Promise<T>): Promise<T> {
	const apis = [chain.rpc, chain.fallback].filter((a): a is string => !!a);
	const isDown = (api: string) => (down.get(api) ?? 0) > Date.now();
	apis.sort((a, b) => Number(isDown(a)) - Number(isDown(b)));
	let first: unknown;
	for (const api of apis) {
		try {
			const r = await call(api);
			down.delete(api);
			return r;
		} catch (e) {
			first ??= e;
			down.set(api, Date.now() + 5 * 60_000);
		}
	}
	throw first;
}

async function stats(
	chain: Chain,
	address: string
): Promise<{ chain_stats: Stats; mempool_stats: Stats }> {
	return esplora(chain, (api) => getJson(`${api}/address/${address}`));
}

/** Balance, key exposure and whether it was ever used, from one request. The key is public
 * once the address has spent: its witness carries the key. */
export async function look(
	chain: Chain,
	address: string
): Promise<{ assets: Asset[]; exposed: boolean; used: boolean }> {
	const s = await stats(chain, address);
	const sats =
		s.chain_stats.funded_txo_sum -
		s.chain_stats.spent_txo_sum +
		s.mempool_stats.funded_txo_sum -
		s.mempool_stats.spent_txo_sum;
	return {
		assets: [
			{ key: 'btc', chain, symbol: chain.symbol, decimals: chain.decimals, amount: BigInt(sats) }
		],
		exposed: s.chain_stats.spent_txo_count + s.mempool_stats.spent_txo_count > 0,
		used: s.chain_stats.funded_txo_count + s.mempool_stats.funded_txo_count > 0
	};
}

export async function balances(chain: Chain, address: string): Promise<Asset[]> {
	return (await look(chain, address)).assets;
}

export async function exposed(chain: Chain, address: string): Promise<boolean> {
	return (await look(chain, address)).exposed;
}

/** Fee rates in sat/vB for slow, normal, fast. */
async function feeRates(chain: Chain): Promise<[number, number, number]> {
	return esplora(chain, async (api) => {
		try {
			// mempool.space's own estimate
			const f = await getJson<{ hourFee: number; halfHourFee: number; fastestFee: number }>(
				`${api}/v1/fees/recommended`
			);
			return [f.hourFee, f.halfHourFee, f.fastestFee];
		} catch {
			// any Esplora
			const e = await getJson<Record<string, number>>(`${api}/fee-estimates`);
			return [e['6'] ?? 2, e['3'] ?? 3, e['1'] ?? 5].map((r) => Math.max(1, Math.ceil(r))) as [
				number,
				number,
				number
			];
		}
	});
}

/** The size the phone's signatures give, the same estimate the phone shows (72-byte signatures). */
export function vsize(inputs: number, outputs: number[]): number {
	const varint = (n: number) => (n < 0xfd ? 1 : 3);
	const base =
		4 +
		varint(inputs) +
		inputs * 41 +
		varint(outputs.length) +
		outputs.reduce((s, o) => s + o, 0) +
		4;
	const witness = 2 + inputs * (1 + 1 + 72 + 1 + 33);
	return Math.ceil((base * 4 + witness) / 4);
}

export async function prepare(i: SendIntent): Promise<Prepared> {
	const { chain } = i.asset;
	if (i.moveAll && i.moveRest === null) throw new Error(t.chains.needsAccount);
	// moving everything pays no one: the one output is the fresh account's
	const recipient = i.moveAll ? null : parseBitcoin(i.to);
	// the phone refuses it too, in any spelling of the same key
	if (!i.moveAll && paysSameKey(i.from.address, i.to)) throw new Error(t.chains.sendElsewhere);
	const coins = (amount: bigint) => `${formatUnits(amount, chain.decimals)} ${chain.symbol}`;
	const [utxos, rates] = await Promise.all([
		esplora(chain, (api) =>
			getJson<{ txid: string; vout: number; value: number }[]>(
				`${api}/address/${i.from.address}/utxo`
			)
		),
		feeRates(chain)
	]);
	if (!utxos.length) throw new Error(t.chains.noCoins);
	if (utxos.length > MAX_INPUTS) throw new Error(t.chains.tooManyCoins(utxos.length, MAX_INPUTS));
	// each previous transaction once, a few at a time
	const txids = [...new Set(utxos.map((u) => u.txid))];
	const hexes = await mapLimit(txids, PARALLEL, async (txid) =>
		(await esplora(chain, (api) => getText(`${api}/tx/${txid}/hex`))).trim()
	);
	const prev = new Map(txids.map((txid, k) => [txid, hexes[k]]));
	const inputs = utxos.map((u) => ({
		txid: u.txid,
		vout: u.vout,
		amount: String(u.value),
		prevTx: prev.get(u.txid)!
	}));
	const total = utxos.reduce((s, u) => s + BigInt(u.value), 0n);
	const rate = BigInt(rates[i.speed]);
	const feeFor = (outputs: number[]) => rate * BigInt(vsize(inputs.length, outputs));
	const change = BTC_OUTPUT_BYTES.p2wpkh;
	const pay = recipient ? BTC_OUTPUT_BYTES[recipient.kind] : change;
	const kind = recipient?.kind ?? 'p2wpkh';

	let amount: bigint;
	let rest = 0n;
	if (i.moveAll || i.amount === null) {
		amount = total - feeFor([pay]);
	} else {
		amount = i.amount;
		rest = total - amount - feeFor([pay, change]);
		if (rest < BigInt(BTC_DUST.p2wpkh)) {
			// too little to keep: it goes to the fee — which must still pay for the transaction
			rest = 0n;
			if (total - amount < feeFor([pay]))
				throw new Error(t.chains.tooLittleAt(coins(total), String(rate)));
		}
	}
	const fee = total - amount - rest;
	if (amount < BigInt(BTC_DUST[kind])) throw new Error(t.chains.dust(BTC_DUST[kind]));
	if (fee <= 0n || amount + fee > total) throw new Error(t.chains.tooLittle(coins(total)));
	if (rest > 0n && i.moveRest === null) throw new Error(t.chains.changeNeedsAccount);

	const outputs: Record<string, unknown>[] = [
		{ to: i.moveAll ? own(i.moveRest!) : { address: i.to }, amount: amount.toString() }
	];
	const summary = [
		i.moveAll ? t.chains.moveTo(coins(amount), i.moveRest!) : t.chains.sendTo(coins(amount), i.to)
	];
	if (rest > 0n) {
		outputs.push({ to: own(i.moveRest!), amount: rest.toString() });
		summary.push(
			i.moveRest === i.from.index
				? t.chains.changeBack(coins(rest))
				: t.chains.moveChange(coins(rest), i.moveRest!)
		);
	}
	summary.push(t.chains.spendAll(inputs.length, coins(total)));
	const request = signRequest('bitcoin', i.from, { inputs, outputs });
	// the previous transactions travel whole, and the phone reads at most 1 MiB
	if (encode(request).length > MAX_MESSAGE) throw new Error(t.chains.tooLarge);
	return { request, summary, fee: `${coins(fee)} (${rate} sat/vB)` };
}

export async function broadcast(chain: Chain, raws: string[]): Promise<Broadcast[]> {
	return Promise.all(
		raws.map(async (raw) => {
			// a busy or unreachable server is no answer: the other one is asked (sending the same
			// transaction twice is harmless); a refusal is the answer
			const r = await esplora(chain, async (api) => {
				const r = await postText(`${api}/tx`, raw);
				if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
				return r;
			});
			return r.ok
				? { hash: r.text.trim(), ok: true }
				: { hash: '', ok: false, error: r.text.trim() };
		})
	);
}
