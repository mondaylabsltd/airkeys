// Balances and key exposure per address, fetched on demand, kept for the session and read again
// in the background while on screen.
import { load, type Look } from './chains';
import type { Account } from './protocol';
import type { Network } from './registry';
import { store } from './state.svelte';
import { t } from './i18n/index.svelte';

export interface Holding extends Look {
	loading: boolean;
	/** Not asked: past the gap of unused Bitcoin accounts (see `ensure`). */
	skipped?: boolean;
}

const cache = $state<Record<string, Holding>>({});
/** When each holding was last read, by the same key: for the refresh in the background. */
const readAt = new Map<string, number>();
// per mode: what a test network holds never mixes with what the real ones hold
const key = (a: Account) => `${store.settings.testnet ? 'test' : 'main'}:${a.network}:${a.address}`;
const blank = { assets: [], failed: [], exposure: 'unknown' as const, used: false };
/** EVM accounts per round of requests: results show up as each round finishes. */
const ROUND = 25;
/** Bitcoin asks one address per request, so it stops after this many unused accounts in a
 * row — as Bitcoin wallets do. Bunker mode moves funds to the lowest unused account, so used
 * accounts sit at the low numbers. */
const GAP = 10;

export function holdingOf(a: Account): Holding | undefined {
	return cache[key(a)];
}

async function round(network: Network, accounts: Account[], quiet = false) {
	let looks = new Map<string, Look>();
	let failed = t.common.noAnswerAtAll;
	try {
		looks = await load(
			network,
			accounts.map((a) => a.address)
		);
	} catch (e) {
		failed = (e as Error).message;
	}
	for (const a of accounts) {
		const look = looks.get(a.address) ?? { ...blank, failed: [failed] };
		const before = cache[key(a)];
		// in the background, a read that missed a chain does not replace a complete one: it is
		// tried again at the next check
		if (quiet && look.failed.length && before && !before.loading && !before.failed.length) continue;
		cache[key(a)] = { ...look, loading: false };
		readAt.set(key(a), Date.now());
	}
}

/** Loads these accounts' holdings (again); it never fails: an account that could not be read
 * says why. With `gap`, Bitcoin accounts are read in order and the reading stops after `GAP`
 * unused ones in a row; the rest are marked skipped. `quiet` leaves what is shown as it is
 * until the new figures arrive (the refresh in the background). */
export async function refresh(accounts: Account[], gap = false, quiet = false) {
	if (!quiet)
		for (const a of accounts)
			cache[key(a)] = { ...(cache[key(a)] ?? blank), loading: true, skipped: false };
	const evm = accounts.filter((a) => a.network === 'evm');
	const btc = accounts.filter((a) => a.network === 'bitcoin').sort((a, b) => a.index - b.index);
	await Promise.all([
		(async () => {
			for (let i = 0; i < evm.length; i += ROUND)
				await round('evm', evm.slice(i, i + ROUND), quiet);
		})(),
		(async () => {
			let unused = 0;
			for (let i = 0; i < btc.length; i += 3) {
				if (gap && unused >= GAP) {
					for (const a of btc.slice(i)) cache[key(a)] = { ...blank, loading: false, skipped: true };
					return;
				}
				const some = btc.slice(i, i + 3);
				await round('bitcoin', some, quiet);
				for (const a of some) {
					// (gone when the mode switched meanwhile)
					const h = cache[key(a)];
					unused = !h || h.used || h.failed.length ? 0 : unused + 1;
				}
			}
		})()
	]);
}

/** How often what is on screen is read again, and the check for it. */
const STALE_MS = 60_000;
const CHECK_MS = 15_000;
let background = false;

/** While on screen: reads `accounts` again, quietly, once they are a minute old, and when the
 * page comes back into view; prices too (`refreshPrices` keeps its own pace). Returns the stop,
 * for an `$effect`. */
export function keepFresh(accounts: () => Account[], gap = false, also?: () => void) {
	const tick = () => {
		if (document.hidden || background) return;
		also?.();
		const now = Date.now();
		const stale = accounts().filter((a) => {
			const h = cache[key(a)];
			return h && !h.loading && now - (readAt.get(key(a)) ?? 0) > STALE_MS;
		});
		if (!stale.length) return;
		background = true;
		void refresh(stale, gap, true).finally(() => (background = false));
	};
	const timer = setInterval(tick, CHECK_MS);
	document.addEventListener('visibilitychange', tick);
	addEventListener('focus', tick);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', tick);
		removeEventListener('focus', tick);
	};
}

/** Forgets what was read of a network's accounts, so they are read again: after a token was
 * added or removed. */
export function forget(network: Network) {
	for (const k of Object.keys(cache)) if (k.split(':')[1] === network) delete cache[k];
}

/** Loads the accounts not loaded yet, Bitcoin up to the gap. */
export function ensure(...accounts: Account[]) {
	const missing = accounts.filter((a) => !cache[key(a)]);
	if (missing.length) void refresh(missing, true);
}

/** The account the rest moves to: the lowest connected account, other than `except`, that the
 * web app has read and seen never used. `null` while none is known to be unused — then more
 * accounts must be connected (or read) first; an account it has not seen is not assumed new.
 * A number stored with two addresses (two wallets connected here) is never chosen: in one of
 * them it may be used. */
export function freshIndex(network: Network, except: number): number | null {
	const mine = store.accounts.filter((a) => a.network === network);
	const doubtful = new Set(
		mine
			.filter((a) => mine.some((b) => b.index === a.index && b.address !== a.address))
			.map((a) => a.index)
	);
	const fresh = mine
		.filter((a) => a.index !== except && !doubtful.has(a.index))
		.filter((a) => {
			const h = holdingOf(a);
			return (
				!!h && !h.loading && !h.skipped && !h.failed.length && !h.used && h.exposure === 'hidden'
			);
		})
		.map((a) => a.index);
	return fresh.length ? Math.min(...fresh) : null;
}
