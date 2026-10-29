// EVM chains over JSON-RPC: balances, whether the key is exposed, transfer requests (§5.2),
// broadcasting.
import { parseEvm } from '../addresses';
import { signRequest } from '../protocol';
import { formatUnits } from '../units';
import type { Chain, Token } from '../registry';
import { t } from '../i18n/index.svelte';
import {
	own,
	rpc,
	rpcBatch,
	type Asset,
	type Broadcast,
	type Prepared,
	type SendIntent
} from './net';

const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const big = (hex: string | null) => (hex && hex !== '0x' ? BigInt(hex) : 0n);

/** Calls per JSON-RPC batch: public endpoints refuse much larger ones (a chain may ask fewer). */
const BATCH = 50;
const batchOf = (chain: Chain) => chain.batch ?? BATCH;

/** Multicall3, at the same address on every chain Airkeys lists: it reads many balances in one
 * `eth_call`. */
export const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
/** Reads per multicall, and multicalls in flight at once to one endpoint: 1,000 reads take
 * about 10M gas, under what public endpoints allow one `eth_call`; one that allows less gets
 * halves (see `readAll`). */
const PER_MULTICALL = 1000;
const MULTICALLS_AT_ONCE = 4;
const MIN_MULTICALL = 100;
const GET_ETH_BALANCE = '0x4d2301cc';
const BALANCE_OF = '0x70a08231';

const word = (n: number) => n.toString(16).padStart(64, '0');

/** `aggregate3(Call3[])` with every call allowed to fail; `calls` are (target, call data). */
export function encodeAggregate3(calls: [string, string][]): string {
	const tuples = calls.map(([to, data]) => {
		const bytes = data.replace(/^0x/, '');
		const len = bytes.length / 2;
		return pad(to) + word(1) + word(0x60) + word(len) + bytes.padEnd(Math.ceil(len / 32) * 64, '0');
	});
	let at = calls.length * 32;
	const offsets = tuples.map((t) => {
		const o = word(at);
		at += t.length / 2;
		return o;
	});
	return '0x82ad56cb' + word(0x20) + word(calls.length) + offsets.join('') + tuples.join('');
}

/** What `aggregate3` answered, `(bool success, bytes data)[]`: each call's first word, or
 * `null` where it failed or answered nothing. */
export function decodeAggregate3(hex: string, n: number): (string | null)[] {
	const h = hex.replace(/^0x/, '');
	const at = (byte: number) => Number(BigInt('0x' + (h.slice(byte * 2, byte * 2 + 64) || '0')));
	const array = at(0);
	if (at(array) !== n) throw new Error(t.net.badAnswer);
	return Array.from({ length: n }, (_, i) => {
		const item = array + 32 + at(array + 32 + i * 32);
		const data = item + at(item + 32);
		const ok = at(item) === 1 && at(data) >= 32;
		return ok ? '0x' + h.slice((data + 32) * 2, (data + 64) * 2) : null;
	});
}

/** Each (target, data) call's answer: through Multicall3, a few multicalls at a time. A
 * multicall the endpoint refuses (too much gas, too large) is asked again in halves, and below
 * `MIN_MULTICALL` as one `eth_call` each (a chain without Multicall3); an endpoint that does not
 * answer fails the read at once. */
async function readAll(chain: Chain, calls: [string, string][]): Promise<(string | null)[]> {
	const out: (string | null)[] = new Array(calls.length).fill(null);
	const chunks: [number, number][] = [];
	for (let i = 0; i < calls.length; i += PER_MULTICALL)
		chunks.push([i, Math.min(i + PER_MULTICALL, calls.length)]);
	// an answer that refuses the call, as opposed to no answer at all
	const refused = (e: unknown) => /^eth_call:|HTTP 413/.test((e as Error).message);

	async function read([from, to]: [number, number]): Promise<void> {
		try {
			const r = await rpc<string>(chain.rpc, 'eth_call', [
				{ to: MULTICALL, data: encodeAggregate3(calls.slice(from, to)) },
				'latest'
			]);
			decodeAggregate3(r, to - from).forEach((x, k) => (out[from + k] = x));
			return;
		} catch (e) {
			if (!refused(e) && !(e as Error).message.startsWith(t.net.badAnswer)) throw e;
			if (to - from > MIN_MULTICALL) {
				const mid = from + Math.ceil((to - from) / 2);
				await read([from, mid]);
				await read([mid, to]);
				return;
			}
		}
		for (let j = from; j < to; j += batchOf(chain)) {
			if (j > from) await new Promise((ok) => setTimeout(ok, 300));
			const res = await rpcBatch(
				chain.rpc,
				calls
					.slice(j, Math.min(j + batchOf(chain), to))
					.map(([target, data]): [string, unknown[]] =>
						// Multicall3's getEthBalance, without Multicall3
						target === MULTICALL && data.startsWith(GET_ETH_BALANCE)
							? ['eth_getBalance', ['0x' + data.slice(-40), 'latest']]
							: ['eth_call', [{ to: target, data }, 'latest']]
					)
			);
			res.forEach((x, k) => (out[j + k] = x));
		}
	}

	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(MULTICALLS_AT_ONCE, chunks.length) }, async () => {
			while (next < chunks.length) await read(chunks[next++]);
		})
	);
	return out;
}

/** The balances (native coin and listed tokens) and the nonce of each address on one chain; a
 * nonce above zero means the address has signed. */
export async function scan(
	chain: Chain,
	addresses: string[]
): Promise<Map<string, { assets: Asset[]; nonce: bigint | null }>> {
	const per = 1 + chain.tokens.length;
	const [balances, signed] = await Promise.all([
		readAll(
			chain,
			addresses.flatMap((a): [string, string][] => [
				[MULTICALL, GET_ETH_BALANCE + pad(a)],
				...chain.tokens.map((tk): [string, string] => [tk.address, BALANCE_OF + pad(a)])
			])
		),
		nonces(chain, addresses)
	]);
	const out = new Map<string, { assets: Asset[]; nonce: bigint | null }>();
	addresses.forEach((a, k) => {
		const r = balances.slice(k * per, (k + 1) * per);
		out.set(a, {
			assets: [
				{
					key: `${chain.chainId}:native`,
					chain,
					symbol: chain.symbol,
					decimals: chain.decimals,
					amount: big(r[0])
				},
				...chain.tokens.map((tk, j): Asset => ({
					key: `${chain.chainId}:${tk.address}`,
					chain,
					token: tk,
					symbol: tk.symbol,
					decimals: tk.decimals,
					amount: big(r[j + 1])
				}))
			],
			nonce: signed.get(a) ?? null
		});
	});
	return out;
}

/** The nonce of each address on one chain (above zero: it has signed there). */
export async function nonces(
	chain: Chain,
	addresses: string[]
): Promise<Map<string, bigint | null>> {
	const out = new Map<string, bigint | null>();
	for (let i = 0; i < addresses.length; i += batchOf(chain)) {
		if (i) await new Promise((ok) => setTimeout(ok, 300));
		const some = addresses.slice(i, i + batchOf(chain));
		const res = await rpcBatch(
			chain.rpc,
			some.map((a): [string, unknown[]] => ['eth_getTransactionCount', [a, 'latest']])
		);
		some.forEach((a, k) => out.set(a, res[k] === null ? null : big(res[k])));
	}
	return out;
}

type Fee = { maxFeePerGas: string; maxPriorityFeePerGas: string } | { gasPrice: string };

async function pricing(chain: Chain, speed: 0 | 1 | 2): Promise<{ fee: Fee; price: bigint }> {
	const block = await rpc<{ baseFeePerGas?: string }>(chain.rpc, 'eth_getBlockByNumber', [
		'latest',
		false
	]);
	if (block.baseFeePerGas) {
		const base = BigInt(block.baseFeePerGas);
		let tip = 1_000_000_000n;
		try {
			tip = BigInt(await rpc<string>(chain.rpc, 'eth_maxPriorityFeePerGas'));
		} catch {
			/* the default */
		}
		tip = (tip * [8n, 10n, 15n][speed]) / 10n;
		const max = base * 2n + tip;
		return {
			fee: { maxFeePerGas: max.toString(), maxPriorityFeePerGas: tip.toString() },
			price: max
		};
	}
	const price =
		(BigInt(await rpc<string>(chain.rpc, 'eth_gasPrice')) * [10n, 11n, 13n][speed]) / 10n;
	return { fee: { gasPrice: price.toString() }, price };
}

const transferData = (to: string, amount: bigint) =>
	'0xa9059cbb' + pad(to) + amount.toString(16).padStart(64, '0');

/** OP-stack chains (Base, OP Mainnet) charge every transaction a layer-1 data fee besides its
 * gas, taken from the same balance. Their fee oracle: */
const L1_ORACLE = '0x420000000000000000000000000000000000000F';

/** The most the layer-1 data fee of one transfer can cost (0 on chains without one), with half
 * again as margin: the layer-1 price moves before the transaction is included. */
async function l1Fee(chain: Chain): Promise<bigint> {
	const code = await rpc<string>(chain.rpc, 'eth_getCode', [L1_ORACLE, 'latest']);
	if (!code || code === '0x') return 0n;
	// getL1FeeUpperBound(uint256 unsignedTxSize): a token transfer is about 110 bytes; 200
	// leaves room
	const bound = await rpc<string>(chain.rpc, 'eth_call', [
		{ to: L1_ORACLE, data: '0xf1c7a58b' + (200).toString(16).padStart(64, '0') },
		'latest'
	]);
	return (BigInt(bound) * 3n) / 2n;
}

/** A gas limit with room: the estimate plus a fifth, or plain 21000 for a coin to a wallet. */
async function gasFor(
	chain: Chain,
	from: string,
	to: string,
	value: bigint,
	data?: string
): Promise<number> {
	const est = Number(
		BigInt(
			await rpc<string>(chain.rpc, 'eth_estimateGas', [
				{ from, to, value: '0x' + value.toString(16), ...(data ? { data } : {}) }
			])
		)
	);
	return est === 21000 ? 21000 : Math.ceil(est * 1.2);
}

/** Transactions one request may hold: the phone's limit (core/wallet/src/review.rs). */
export const MAX_TXS = 16;

const tokenRef = (t: Token) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals });

export async function prepare(i: SendIntent): Promise<Prepared> {
	const { chain } = i.asset;
	const from = i.from.address;
	if (i.moveAll && i.moveRest === null) throw new Error(t.chains.needsAccount);
	const to = i.moveAll ? '' : parseEvm(i.to);
	// the phone refuses it too: coins sent back would sit behind the key this send reveals
	if (!i.moveAll && to.toLowerCase() === from.toLowerCase())
		throw new Error(t.chains.sendElsewhere);
	// a stand-in recipient for estimates of transfers to an account named by number: a random
	// address, so a new holder — the estimate covers the costlier first deposit (a well-known
	// address may already hold the token, and would under-estimate by ~17,000 gas)
	const probe =
		'0x' +
		Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
			b.toString(16).padStart(2, '0')
		).join('');
	const [{ fee, price }, nonceHex, l1, coinGas] = await Promise.all([
		pricing(chain, i.speed),
		rpc<string>(chain.rpc, 'eth_getTransactionCount', [from, 'pending']),
		l1Fee(chain),
		// a plain transfer of the native coin: 21,000 gas on most chains, more on Arbitrum
		gasFor(chain, from, probe, 1n)
	]);
	let nonce = Number(BigInt(nonceHex));
	const txs: Record<string, unknown>[] = [];
	const summary: string[] = [];
	let fees = 0n; // the most all transactions can cost in fees
	let restFees = 0n; // of which, moving the rest
	let values = 0n; // native coin sent
	const balance = i.holdings.find((a) => !a.token)?.amount ?? 0n;
	const room = () => balance - fees - values;
	/** The most one transaction can cost: its gas, and its layer-1 data fee where there is one. */
	const cost = (gas: number | bigint) => BigInt(gas) * price + l1;

	const push = (tx: Record<string, unknown>, gas: number, line: string, rest = false) => {
		txs.push({ ...tx, nonce: nonce++, gas, ...fee });
		fees += cost(gas);
		if (rest) restFees += cost(gas);
		if (!tx.token) values += BigInt(tx.amount as string);
		summary.push(line);
	};

	// the transfer asked for first; tokens that move next; the native coin that moves last
	const tokens =
		i.moveRest === null
			? []
			: i.holdings.filter((a) => a.token && a.amount > 0n && (i.moveAll || a.key !== i.asset.key));
	// one request holds at most MAX_TXS transactions (the phone refuses more): the send, the coin
	// that moves last, and as many tokens as fit between, in the registry's order; the rest stay
	// for another request
	const fit =
		MAX_TXS -
		(i.moveAll ? 0 : 1) -
		(i.moveRest !== null ? 1 : 0) -
		// the rest of a token sent, moving right after it
		(!i.moveAll && i.asset.token && i.moveRest !== null ? 1 : 0);
	const moving = tokens.slice(0, fit);
	const staying = tokens.slice(fit);
	if (i.moveAll) {
		// nothing is paid: every token, then the coin, moves below
	} else if (i.asset.token) {
		const amount = i.amount ?? i.asset.amount;
		if (amount <= 0n || amount > i.asset.amount)
			throw new Error(
				t.chains.holds(`${formatUnits(i.asset.amount, i.asset.decimals)} ${i.asset.symbol}`)
			);
		const gas = await gasFor(chain, from, i.asset.token.address, 0n, transferData(to, amount));
		push(
			{ to: { address: to }, amount: amount.toString(), token: tokenRef(i.asset.token) },
			gas,
			t.chains.sendTo(`${formatUnits(amount, i.asset.decimals)} ${i.asset.symbol}`, to)
		);
		if (i.moveRest !== null && amount < i.asset.amount)
			moving.unshift({ ...i.asset, amount: i.asset.amount - amount });
	} else {
		const gas = await gasFor(chain, from, to, 0n);
		// sending everything, or the rest moving after: keep the fees of what follows
		const later =
			BigInt(moving.length) * cost(100_000) + (i.moveRest !== null ? cost(coinGas) : 0n);
		const amount = i.amount ?? balance - cost(gas) - later;
		if (amount <= 0n) throw new Error(t.chains.feeNotCovered);
		if (amount + cost(gas) > balance)
			throw new Error(
				t.chains.tooLittle(`${formatUnits(balance, chain.decimals)} ${chain.symbol}`)
			);
		push(
			{ to: { address: to }, amount: amount.toString() },
			gas,
			t.chains.sendTo(`${formatUnits(amount, chain.decimals)} ${chain.symbol}`, to)
		);
	}
	for (const a of moving) {
		const gas = await gasFor(chain, from, a.token!.address, 0n, transferData(probe, a.amount));
		push(
			{ to: own(i.moveRest!), amount: a.amount.toString(), token: tokenRef(a.token!) },
			gas,
			t.chains.moveTo(`${formatUnits(a.amount, a.decimals)} ${a.symbol}`, i.moveRest!),
			true
		);
	}
	if (i.moveRest !== null) {
		const left = room() - cost(coinGas);
		if (left > 0n)
			push(
				{ to: own(i.moveRest), amount: left.toString() },
				coinGas,
				t.chains.moveTo(`${formatUnits(left, chain.decimals)} ${chain.symbol}`, i.moveRest),
				true
			);
	}
	if (!txs.length) throw new Error(t.chains.nothingToMove);
	if (room() < 0n)
		throw new Error(
			t.chains.feesExceed(
				`${formatUnits(fees, chain.decimals)} ${chain.symbol}`,
				formatUnits(balance, chain.decimals)
			)
		);
	const request = signRequest('evm', i.from, { chainId: chain.chainId, txs });
	return {
		request,
		summary,
		fee: `≤ ${formatUnits(fees, chain.decimals)} ${chain.symbol}`,
		...(staying.length
			? { left: t.chains.stayBehind(staying.map((a) => a.symbol).join(', ')) }
			: {}),
		// a send that also moves the rest: what the moves add to its fee
		...(!i.moveAll && restFees > 0n
			? { restFee: `≤ ${formatUnits(restFees, chain.decimals)} ${chain.symbol}` }
			: {})
	};
}

export async function broadcast(chain: Chain, raws: string[]): Promise<Broadcast[]> {
	const out: Broadcast[] = [];
	for (const raw of raws) {
		try {
			out.push({ hash: await rpc<string>(chain.rpc, 'eth_sendRawTransaction', [raw]), ok: true });
		} catch (e) {
			out.push({ hash: '', ok: false, error: (e as Error).message });
		}
	}
	return out;
}
