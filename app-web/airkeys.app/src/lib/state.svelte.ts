// What the web app keeps: the accounts the phone has shown it (addresses only) and the
// settings (endpoints, extra EVM chains). Both live in this browser's storage and nowhere else;
// nothing here is secret.
import { NETWORKS, registry, type Chain, type Network, type Token } from './registry';
import { isIndex, type Account } from './protocol';
import { isHttpUrl } from './chains/net';
import { isLang, lang, type Lang } from './i18n/index.svelte';

export interface Settings {
	/** Endpoint per chain key: "bitcoin", "evm:<chainId>". */
	rpc: Record<string, string>;
	/** EVM chains added by hand. */
	chains: Chain[];
	/** ERC-20 tokens added by hand, per chain key ("evm:<chainId>"): never priced, and the
	 * phone shows them as not listed. */
	tokens?: Record<string, Token[]>;
	/** Show test networks instead of the real ones: their coins have no value, and the two are
	 * never shown together. */
	testnet?: boolean;
	/** The currency totals are shown in, ISO 4217 ("USD" when absent). */
	currency?: string;
	/** Where rates from the US dollar come from (Vela's exchange-rate service when absent). */
	fx?: string;
	/** The language chosen in the header; absent, the browser's. */
	lang?: Lang;
	/** `false`: bunker mode off — a plain cold wallet. A send moves only what is entered, Home
	 * does not ask to move anything, and receiving stays on one account. On when absent. */
	bunker?: boolean;
}

const KEY = 'airkeys.v1';

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored chain, or `null` when it is not one: storage is anyone's to edit. */
function storedChain(c: unknown): Chain | null {
	if (!isObject(c)) return null;
	const { chainId, name, symbol, decimals, rpc, explorer, tokens, testnet } = c;
	if (
		!Number.isInteger(chainId) ||
		typeof name !== 'string' ||
		typeof symbol !== 'string' ||
		!Number.isInteger(decimals) ||
		typeof rpc !== 'string' ||
		!isHttpUrl(rpc)
	)
		return null;
	const text = (v: unknown) => (typeof v === 'string' ? v : '');
	return {
		chainId: chainId as number,
		name,
		symbol,
		decimals: decimals as number,
		rpc,
		explorer: isObject(explorer)
			? { tx: text(explorer.tx), address: text(explorer.address) }
			: { tx: '', address: '' },
		tokens: (Array.isArray(tokens) ? tokens : []).filter(
			(t): t is Token =>
				isObject(t) &&
				typeof t.address === 'string' &&
				typeof t.symbol === 'string' &&
				Number.isInteger(t.decimals)
		),
		...(testnet === true ? { testnet } : {})
	};
}

/** A token symbol the phone accepts: 1 to 16 printable ASCII characters (wallet/src/review.rs). */
export const symbolOk = (s: string) => /^[!-~]{1,16}$/.test(s);

/** Stored tokens, each checked again: storage is anyone's to edit. */
function storedTokens(v: Record<string, unknown>): Record<string, Token[]> {
	return Object.fromEntries(
		Object.entries(v)
			.filter(([key, list]) => /^evm:\d+$/.test(key) && Array.isArray(list))
			.map(([key, list]) => [
				key,
				(list as unknown[]).filter(
					(t): t is Token =>
						isObject(t) &&
						typeof t.address === 'string' &&
						/^0x[0-9a-fA-F]{40}$/.test(t.address) &&
						typeof t.symbol === 'string' &&
						symbolOk(t.symbol) &&
						Number.isInteger(t.decimals) &&
						(t.decimals as number) >= 0 &&
						(t.decimals as number) <= 36
				)
			])
	);
}

function load(): { accounts: Account[]; settings: Settings } {
	const empty = { accounts: [], settings: { rpc: {}, chains: [] } };
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!isObject(v) || !Array.isArray(v.accounts)) return empty;
		const s = isObject(v.settings) ? v.settings : {};
		return {
			// accounts of unknown networks are dropped
			accounts: v.accounts.filter(
				(a: unknown): a is Account =>
					isObject(a) &&
					NETWORKS.includes(a.network as Network) &&
					isIndex(a.index) &&
					typeof a.address === 'string'
			),
			// what older versions kept too (explorers per chain) is left out
			settings: {
				rpc: Object.fromEntries(
					Object.entries(isObject(s.rpc) ? s.rpc : {}).filter(
						(e): e is [string, string] => typeof e[1] === 'string' && isHttpUrl(e[1])
					)
				),
				chains: (Array.isArray(s.chains) ? s.chains : [])
					.map(storedChain)
					.filter((c): c is Chain => !!c),
				...(typeof s.testnet === 'boolean' ? { testnet: s.testnet } : {}),
				...(typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency)
					? { currency: s.currency }
					: {}),
				...(typeof s.fx === 'string' && isHttpUrl(s.fx) ? { fx: s.fx } : {}),
				...(isLang(s.lang) ? { lang: s.lang } : {}),
				...(s.bunker === false ? { bunker: false } : {}),
				...(isObject(s.tokens) ? { tokens: storedTokens(s.tokens) } : {})
			}
		};
	} catch {
		return empty;
	}
}

export const store = $state(
	typeof localStorage === 'undefined'
		? { accounts: [] as Account[], settings: { rpc: {}, chains: [] } as Settings }
		: load()
);
// the language chosen before, over the browser's
if (store.settings.lang) lang.current = store.settings.lang;

/** Accounts the phone shows at once: a page, #0–#99, #100–#199 and so on (core/app/src/app.rs). */
export const PAGE = 100;

/** The page of accounts to connect next on a network: the one after the highest connected. */
export function nextPage(network: Network): { start: number; end: number } {
	const top = Math.max(
		-1,
		...store.accounts.filter((a) => a.network === network).map((a) => a.index)
	);
	const start = (Math.floor(top / PAGE) + 1) * PAGE;
	return { start, end: start + PAGE - 1 };
}

/** Bunker mode: funds kept behind keys no one has seen (on unless turned off in Settings). */
export const bunkerOn = () => store.settings.bunker !== false;

export function setBunker(on: boolean) {
	if (on) delete store.settings.bunker;
	else store.settings.bunker = false;
	save();
}

/** Shows the app in a language, now and on the next visit. */
export function setLang(l: Lang) {
	lang.current = l;
	store.settings.lang = l;
	save();
}

export function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify(store));
	} catch {
		/* private mode: the session still works */
	}
}

export function chainKey(network: Network, chain?: Chain): string {
	return network === 'evm' ? `evm:${chain?.chainId}` : network;
}

/** The tokens added by hand to a chain. */
export const addedTokens = (c: Chain): Token[] => store.settings.tokens?.[chainKey('evm', c)] ?? [];

/** Adds a token to a chain, by hand; `false` when the chain has it already. */
export function addToken(c: Chain, token: Token): boolean {
	const same = (x: Token) => x.address.toLowerCase() === token.address.toLowerCase();
	if (c.tokens.some(same) || addedTokens(c).some(same)) return false;
	store.settings.tokens = {
		...store.settings.tokens,
		[chainKey('evm', c)]: [...addedTokens(c), token]
	};
	save();
	return true;
}

export function removeToken(c: Chain, address: string) {
	const key = chainKey('evm', c);
	store.settings.tokens = {
		...store.settings.tokens,
		[key]: addedTokens(c).filter((x) => x.address.toLowerCase() !== address.toLowerCase())
	};
	if (!store.settings.tokens[key].length) delete store.settings.tokens[key];
	save();
}

function withSettings(network: Network, c: Chain): Chain {
	const key = chainKey(network, c);
	const own = network === 'evm' ? addedTokens(c) : [];
	return {
		...c,
		// the tokens listed, then those added by hand
		tokens: [
			...c.tokens,
			...own.filter(
				(x) => !c.tokens.some((y) => y.address.toLowerCase() === x.address.toLowerCase())
			)
		],
		rpc: store.settings.rpc[key] || c.rpc,
		// an endpoint chosen in Settings is the only one used
		fallback: store.settings.rpc[key] ? undefined : c.fallback
	};
}

/** The chains of a network, with the settings applied: those of the mode shown (mainnet or
 * testnet), or with `all`, every one. Bitcoin is mainnet only. */
export function chainsOf(network: Network, all = false): Chain[] {
	const testnet = !!store.settings.testnet;
	if (network === 'evm')
		return [...registry.evm, ...store.settings.chains]
			.filter((c) => all || !!c.testnet === testnet)
			.map((c) => withSettings('evm', c));
	return all || !testnet ? [withSettings(network, registry[network])] : [];
}

const same = (a: Account, b: Account) => a.network === b.network && a.address === b.address;
/** One number of one network with two addresses: two wallets, or one phrase under two
 * passphrases. */
const clash = (a: Account, b: Account) =>
	a.network === b.network && a.index === b.index && a.address !== b.address;

/** The stored accounts these contradict: they are of another wallet. */
export function conflicts(accounts: Account[]): Account[] {
	return store.accounts.filter((b) => accounts.some((a) => clash(a, b)));
}

/** Adds accounts the phone showed; returns how many were new. One that contradicts a stored
 * account is left out: it is of another wallet (see `replaceAccounts`). */
export function addAccounts(accounts: Account[]): number {
	let added = 0;
	for (const a of accounts) {
		if (!store.accounts.some((b) => same(a, b) || clash(a, b))) {
			store.accounts.push(a);
			added++;
		}
	}
	store.accounts.sort((a, b) => a.index - b.index);
	save();
	return added;
}

/** Another wallet's accounts in place of every stored one. */
export function replaceAccounts(accounts: Account[]): number {
	store.accounts = [];
	return addAccounts(accounts);
}

export function removeAccount(a: Account) {
	store.accounts = store.accounts.filter((b) => !same(a, b));
	save();
}
