// The networks and tokens Airkeys knows by name — the same file the phone's core embeds, so a
// token listed here is one the phone shows as listed. RPC and explorer URLs are defaults the
// settings can replace.
import data from '../../../../registry/networks.json';
import { isHttpUrl } from './chains/net';

export type Network = 'bitcoin' | 'evm';
export const NETWORKS: Network[] = ['bitcoin', 'evm'];

export interface Token {
	address: string;
	symbol: string;
	decimals: number;
}

export interface Explorer {
	tx: string;
	address: string;
}

export interface Chain {
	/** EVM chains only. */
	chainId?: number;
	name: string;
	symbol: string;
	decimals: number;
	/** JSON-RPC (EVM) or an Esplora REST API (Bitcoin). */
	rpc: string;
	/** Bitcoin: a second Esplora API for when the first fails (unless Settings name one). */
	fallback?: string;
	explorer: Explorer;
	tokens: Token[];
	testnet?: boolean;
	/** Calls per JSON-RPC batch, for an endpoint that refuses the usual 50. */
	batch?: number;
}

type Raw = { rpc?: string; api?: string; tokens?: Token[] } & Omit<Chain, 'rpc' | 'tokens'>;
const chain = (c: Raw): Chain => ({ ...c, rpc: (c.rpc ?? c.api)!, tokens: c.tokens ?? [] });

export const registry = {
	bitcoin: chain(data.bitcoin as Raw),
	evm: (data.evm as Raw[]).map(chain)
};

export const NETWORK_NAMES: Record<Network, string> = {
	bitcoin: 'Bitcoin',
	evm: 'Ethereum & EVM'
};

/** Derivation paths, every step hardened, under Airkeys' own first step (PROTOCOL §3). */
export function path(network: Network, index: number): string {
	switch (network) {
		case 'bitcoin':
			return `m/65738275'/84'/0'/0'/0'/${index}'`;
		case 'evm':
			return `m/65738275'/44'/60'/0'/0'/${index}'`;
	}
}

/** The explorer's page for a hash or an address; `null` when the template ("{}" for the value)
 * is empty or not a web address. */
export function explorerLink(template: string, value: string): string | null {
	const url = template.replace('{}', value);
	return template.includes('{}') && isHttpUrl(url) ? url : null;
}
