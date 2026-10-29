// What the accounts hold, summed: which price feed values each asset, and the home screen's
// figures — the total, what sits behind hidden keys, what sits behind exposed ones and should
// move. Pure: prices and holdings come in, numbers come out.
import type { Asset, Exposure } from './chains/net';
import type { Account } from './protocol';
import { registry, type Chain } from './registry';
import { formatUnits } from './units';

/** Chainlink price feeds (USD, 8 decimals each — checked with `decimals()`), read where they
 * live: Ethereum, and BNB Smart Chain for BNB (there is no BNB feed on Ethereum). */
export const FEEDS: { key: string; chainId: number; address: string }[] = [
	{ key: 'ETH', chainId: 1, address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' },
	{ key: 'BTC', chainId: 1, address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' },
	{ key: 'USDC', chainId: 1, address: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6' },
	{ key: 'USDT', chainId: 1, address: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D' },
	{ key: 'DAI', chainId: 1, address: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9' },
	// "MATIC / USD": the coin was renamed POL; the feed kept its name
	{ key: 'POL', chainId: 1, address: '0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676' },
	{ key: 'AVAX', chainId: 1, address: '0xFF3EEb22B5E3dE6e705b44749C2559d704923FD7' },
	{ key: 'BNB', chainId: 56, address: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE' },
	{ key: 'LINK', chainId: 1, address: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c' },
	{ key: 'UNI', chainId: 1, address: '0x553303d460EE0afB37EdFf9bE42922D8FF63220e' },
	{ key: 'AAVE', chainId: 1, address: '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9' },
	{ key: 'stETH', chainId: 1, address: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8' },
	{ key: 'CRV', chainId: 1, address: '0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f' },
	{ key: 'MKR', chainId: 1, address: '0xec1D1B3b0443256cc3860e24a46F108e699484Aa' },
	{ key: 'COMP', chainId: 1, address: '0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5' },
	{ key: 'PYUSD', chainId: 1, address: '0x8f1dF6D7F2db73eECE86a18b4381F4707b918FB1' },
	{ key: 'EURC', chainId: 1, address: '0x04F84020Fdf10d9ee64D1dcC2986EDF2F556DA11' }
];

/** A feed answer older than this is not a price: a feed that stopped is not today's value. */
export const STALE_SECONDS = 24 * 3600;

/** Valued as another: wrapped coins, and bridged stablecoins at par (".e", USDbC, USDT0, xDAI)
 * — an assumption that holds while the bridge does. Tokens of smaller bridges (axlUSDC, Orbit's
 * oUSDC) are left unpriced: some have lost their peg. */
const SAME_AS: Record<string, string> = {
	WETH: 'ETH',
	WBTC: 'BTC',
	WPOL: 'POL',
	WAVAX: 'AVAX',
	WBNB: 'BNB',
	'USDC.e': 'USDC',
	USDbC: 'USDC',
	USDT0: 'USDT',
	'USDT.e': 'USDT',
	'DAI.e': 'DAI',
	xDAI: 'DAI',
	WXDAI: 'DAI',
	PYUSD0: 'PYUSD',
	// Avalanche's bridge from Ethereum
	'LINK.e': 'LINK',
	'AAVE.e': 'AAVE',
	'UNI.e': 'UNI',
	'COMP.e': 'COMP'
};

/** The feed that values an asset, or `null`. Only what Airkeys lists is priced — a coin of a
 * listed mainnet, a token at a listed address — so a token that merely calls itself "USDC",
 * or a chain added by hand that calls its coin "ETH", is never shown as worth anything. */
export function priceKey(asset: Asset): string | null {
	const c = asset.chain;
	if (c.testnet) return null;
	let symbol: string | undefined;
	// only Bitcoin has no chain id (Settings hand out copies of it, with their endpoint)
	if (c.chainId === undefined) symbol = 'BTC';
	else {
		const listed = registry.evm.find((x) => x.chainId === c.chainId && !x.testnet);
		if (!listed) return null;
		if (!asset.token) symbol = listed.symbol;
		else
			symbol = listed.tokens.find(
				(t) => t.address.toLowerCase() === asset.token!.address.toLowerCase()
			)?.symbol;
	}
	if (!symbol) return null;
	const key = SAME_AS[symbol] ?? symbol;
	return FEEDS.some((f) => f.key === key) ? key : null;
}

/** `latestRoundData()` (the selector) and its answer: the price, or `null` when it is not one
 * (zero, negative, stale, or not an answer at all). */
export const LATEST_ROUND = '0xfeaf968c';
export function readRound(hex: string | null, now: number): number | null {
	if (!hex || hex.length < 2 + 64 * 4) return null;
	const word = (k: number) => BigInt('0x' + hex.slice(2 + 64 * k, 2 + 64 * (k + 1)));
	const answer = BigInt.asIntN(256, word(1));
	const updated = Number(word(3));
	if (answer <= 0n || now - updated > STALE_SECONDS) return null;
	return Number(answer) / 1e8;
}

/** An amount as a number, for sums shown to the person (never for what is signed). */
export const amountOf = (a: Asset) => Number(formatUnits(a.amount, a.decimals, false));

export interface Holder {
	account: Account;
	assets: Asset[];
	exposure: Exposure;
	/** Its balances are being read, or could not be read on every chain. */
	partial: boolean;
}

/** One asset — a coin or token on one chain — across every account that holds it. */
export interface Line {
	key: string;
	asset: Asset;
	amount: bigint;
	value: number | null;
	holders: { account: Account; amount: bigint; value: number | null; exposure: Exposure }[];
}

/** What an exposed account holds on one chain: one signing moves it all. */
export interface ToMove {
	account: Account;
	chain: Chain;
	assets: Asset[];
	value: number | null;
}

export interface Summary {
	total: number;
	bunker: number;
	exposed: number;
	/** Held where it is not known yet whether the key is exposed. */
	unknown: number;
	bunkerAccounts: number;
	exposedAccounts: number;
	/** Symbols held that have no price: they count in no total. */
	unpriced: string[];
	lines: Line[];
	toMove: ToMove[];
}

const chainId = (c: Chain) => (c.chainId === undefined ? 'bitcoin' : String(c.chainId));
/** Two chains are one when their ids match — a chain added by hand may share a listed name. */
export const sameChain = (a: Chain, b: Chain) => chainId(a) === chainId(b) && a.name === b.name;

export function summarize(holders: Holder[], valueOf: (a: Asset) => number | null): Summary {
	const s: Summary = {
		total: 0,
		bunker: 0,
		exposed: 0,
		unknown: 0,
		bunkerAccounts: 0,
		exposedAccounts: 0,
		unpriced: [],
		lines: [],
		toMove: []
	};
	const lines = new Map<string, Line>();
	const unpriced = new Set<string>();
	for (const h of holders) {
		const held = h.assets.filter((a) => a.amount > 0n);
		let worth = 0;
		for (const a of held) {
			const value = valueOf(a);
			if (value === null) unpriced.add(a.symbol);
			else worth += value;
			const key = `${chainId(a.chain)}:${a.chain.name}:${a.token?.address.toLowerCase() ?? 'native'}`;
			const line = lines.get(key) ?? { key, asset: a, amount: 0n, value: null, holders: [] };
			line.amount += a.amount;
			if (value !== null) line.value = (line.value ?? 0) + value;
			line.holders.push({ account: h.account, amount: a.amount, value, exposure: h.exposure });
			lines.set(key, line);
		}
		s.total += worth;
		if (h.exposure === 'hidden') {
			s.bunker += worth;
			if (held.length) s.bunkerAccounts++;
		} else if (h.exposure === 'exposed') {
			s.exposed += worth;
			if (held.length) s.exposedAccounts++;
			// one entry per chain that holds something
			for (const a of held) {
				const entry = s.toMove.find((m) => m.account === h.account && sameChain(m.chain, a.chain));
				const value = valueOf(a);
				if (entry) {
					entry.assets.push(a);
					if (value !== null) entry.value = (entry.value ?? 0) + value;
				} else s.toMove.push({ account: h.account, chain: a.chain, assets: [a], value });
			}
		} else s.unknown += worth;
	}
	const byWorth = <T extends { value: number | null }>(a: T, b: T) =>
		(b.value ?? -1) - (a.value ?? -1);
	s.lines = [...lines.values()].sort(
		(a, b) => byWorth(a, b) || a.asset.symbol.localeCompare(b.asset.symbol)
	);
	for (const l of s.lines) l.holders.sort(byWorth);
	s.toMove.sort(byWorth);
	s.unpriced = [...unpriced].sort();
	return s;
}

/** What an account holds on the other chains of its network: a first send on one EVM chain
 * reveals the key on all of them. */
export function elsewhere(assets: Asset[], chain: Chain): { chain: Chain; assets: Asset[] }[] {
	const out: { chain: Chain; assets: Asset[] }[] = [];
	for (const a of assets) {
		if (a.amount <= 0n || sameChain(a.chain, chain)) continue;
		const entry = out.find((e) => sameChain(e.chain, a.chain));
		if (entry) entry.assets.push(a);
		else out.push({ chain: a.chain, assets: [a] });
	}
	return out;
}
