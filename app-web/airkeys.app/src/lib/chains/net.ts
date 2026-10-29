// HTTP for the chain clients: JSON-RPC and JSON over HTTP, with a timeout and errors that say
// which endpoint failed.
import type { Chain, Token } from '../registry';
import type { Account, SignRequest, Target } from '../protocol';
import { t } from '../i18n/index.svelte';

const TIMEOUT_MS = 20_000;

/** An absolute http: or https: URL: the only kind of address Airkeys asks or links to. */
export function isHttpUrl(s: string): boolean {
	try {
		const { protocol } = new URL(s);
		return protocol === 'https:' || protocol === 'http:';
	} catch {
		return false;
	}
}

async function once(url: string, init: RequestInit): Promise<Response> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: ctl.signal });
	} catch (e) {
		const host = new URL(url).host;
		throw new Error((e as Error).name === 'AbortError' ? t.net.late(host) : t.net.noAnswer(host));
	} finally {
		clearTimeout(timer);
	}
}

/** A request, asked again after 1, 3 and 9 s while the server says it is busy (HTTP 429):
 * public endpoints limit how fast one visitor may ask. */
async function request(url: string, init: RequestInit): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const r = await once(url, init);
		if (r.status !== 429 || attempt === 3) return r;
		await new Promise((ok) => setTimeout(ok, 1000 * 3 ** attempt));
	}
}

export async function getJson<T = unknown>(url: string): Promise<T> {
	const r = await request(url, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
	return r.json();
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
	const r = await request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
	return r.json();
}

export async function getText(url: string): Promise<string> {
	const r = await request(url, {});
	if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
	return r.text();
}

export async function postText(
	url: string,
	body: string
): Promise<{ ok: boolean; status: number; text: string }> {
	const r = await request(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
	return { ok: r.ok, status: r.status, text: await r.text() };
}

type RpcAnswer = { id?: unknown; result?: unknown; error?: { message?: string } };

let rpcId = 0;
export async function rpc<T = unknown>(
	url: string,
	method: string,
	params: unknown[] = []
): Promise<T> {
	const j = await postJson<RpcAnswer | null>(url, { jsonrpc: '2.0', id: ++rpcId, method, params });
	if (j?.error) throw new Error(`${method}: ${j.error.message ?? JSON.stringify(j.error)}`);
	return j?.result as T;
}

/** Several calls in one JSON-RPC batch, each answering a hex string; a failed call gives
 * `null`. */
export async function rpcBatch(
	url: string,
	calls: [string, unknown[]][]
): Promise<(string | null)[]> {
	if (!calls.length) return [];
	const base = ++rpcId * 1000;
	const out = await postJson<RpcAnswer[] | RpcAnswer | null>(
		url,
		calls.map(([method, params], i) => ({ jsonrpc: '2.0', id: base + i, method, params }))
	);
	// an endpoint that does not take batches answers with one error, or anything else
	if (!Array.isArray(out))
		throw new Error(`${new URL(url).host}: ${out?.error?.message ?? t.net.noBatch}`);
	const byId = new Map(out.map((r) => [r?.id, r?.result]));
	return calls.map((_, i) => {
		const r = byId.get(base + i);
		return typeof r === 'string' ? r : null;
	});
}

/** `fn` over `items`, at most `n` at a time: public servers limit request rates. */
export async function mapLimit<T, R>(
	items: T[],
	n: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		for (let k = next++; k < items.length; k = next++) out[k] = await fn(items[k]);
	};
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
}

/** One coin or token an account holds on one chain. */
export interface Asset {
	key: string;
	chain: Chain;
	/** Absent for the native coin. */
	token?: Token;
	symbol: string;
	decimals: number;
	amount: bigint;
}

export type Exposure = 'hidden' | 'exposed' | 'unknown';

/** What a send asks for. */
export interface SendIntent {
	from: Account;
	asset: Asset;
	/** The recipient's address. */
	to: string;
	/** Base units; `null` sends everything. */
	amount: bigint | null;
	/** Move what is left of every asset on this chain to this account of the wallet. */
	moveRest: number | null;
	/** Everything the account holds on the chain (for `moveRest`). */
	holdings: Asset[];
	/** Fee level, 0 (slow) to 2 (fast). */
	speed: 0 | 1 | 2;
	/** Pay no one: move everything on the chain to account `moveRest` (`to`, `amount` and
	 * `asset`'s amount are not used; `asset` names the chain). */
	moveAll?: boolean;
}

export interface Prepared {
	request: SignRequest;
	/** What the request does, line by line, before the phone shows it again. */
	summary: string[];
	/** The most it can cost in fees, as text. */
	fee: string;
	/** What stays behind for a second request, in words: past what one request may hold. */
	left?: string;
	/** Of `fee`, what moving the rest may cost, as text: shown so it can be weighed. */
	restFee?: string;
}

export interface Broadcast {
	hash: string;
	ok: boolean;
	error?: string;
}

export const own = (index: number): Target => ({ index });
