<script lang="ts">
	// ERC-20 tokens added by hand, per network: found by name in ethereum-data.getvela.app's
	// index, or by contract address; what the token is called and its decimals are always read
	// from the contract itself. They are never priced, and the phone shows them as not listed.
	import type { Token } from '#lib/registry.ts';
	import { addToken, addedTokens, chainsOf, removeToken } from '#lib/state.svelte.ts';
	import { forget } from '#lib/holdings.svelte.ts';
	import { readToken, searchTokens, tokenIndex, tokenLogo, type TokenHit } from '#lib/chainData.ts';
	import type { Asset } from '#lib/chains/index.ts';
	import Coin from '#lib/ui/Coin.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	const chains = $derived(chainsOf('evm'));
	let chainId = $state(1);
	// the network on screen belongs to the mode shown; another mode starts on its first one
	const chain = $derived(chains.find((c) => c.chainId === chainId) ?? chains[0]);

	let query = $state('');
	let index = $state<TokenHit[] | null>(null);
	let loadingIndex = $state(false);
	let problem = $state('');
	let done = $state('');
	/** The token read from its contract, waiting to be added. */
	let offer = $state<{ token: Token; name?: string; logo: boolean } | null>(null);
	let reading = $state(false);

	const isAddress = (q: string) => /^0x[0-9a-fA-F]{40}$/.test(q.trim());
	const hits = $derived(
		index && chain && !isAddress(query) ? searchTokens(index, chain.chainId!, query) : []
	);
	const added = $derived(chain ? addedTokens(chain) : []);
	// the coin badge takes an asset: the token on this chain, no amount
	const asAsset = (tk: Token): Asset => ({
		key: tk.address,
		chain: chain!,
		token: tk,
		symbol: tk.symbol,
		decimals: tk.decimals,
		amount: 0n
	});
	const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

	async function typed() {
		problem = done = '';
		offer = null;
		if (isAddress(query)) return void read(query.trim());
		if (index || loadingIndex || !query.trim()) return;
		loadingIndex = true;
		try {
			index = await tokenIndex();
		} catch (e) {
			problem = t.tokens.indexFailed((e as Error).message);
		} finally {
			loadingIndex = false;
		}
	}

	async function read(address: string, hit?: TokenHit) {
		if (!chain) return;
		problem = done = '';
		offer = null;
		reading = true;
		try {
			const token = await readToken(chain, address);
			const same = (x: Token) => x.address.toLowerCase() === token.address.toLowerCase();
			if (added.some(same)) throw new Error(t.tokens.already);
			if (chain.tokens.some(same)) throw new Error(t.tokens.listed);
			offer = { token, name: hit?.name, logo: hit?.hasLogo ?? true };
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			reading = false;
		}
	}

	function add() {
		if (!chain || !offer) return;
		addToken(chain, offer.token);
		// the accounts' holdings are read again, with this token
		forget('evm');
		done = t.tokens.added(offer.token.symbol);
		offer = null;
		query = '';
	}
</script>

<section class="card stack">
	<div class="label">{t.tokens.title}</div>
	<p class="small">{t.tokens.lead}</p>
	<div class="row pick">
		<label class="small" for="token-chain">{t.tokens.network}</label>
		<select
			id="token-chain"
			value={chain?.chainId}
			onchange={(e) => {
				chainId = Number(e.currentTarget.value);
				offer = null;
				problem = done = '';
			}}
		>
			{#each chains as c (c.chainId)}<option value={c.chainId}>{c.name}</option>{/each}
		</select>
	</div>
	<input
		bind:value={query}
		oninput={typed}
		placeholder={t.tokens.search}
		aria-label={t.tokens.search}
		spellcheck="false"
		autocomplete="off"
	/>
	{#if loadingIndex}<p class="small" role="status">{t.tokens.loadingIndex}</p>{/if}
	{#if hits.length && !offer}
		<div class="hits">
			{#each hits as h (h.address)}
				<button class="plain hit" onclick={() => read(h.address, h)}>
					{#if h.hasLogo}<img
							src={tokenLogo(h.chainId, h.address)}
							alt=""
							width="28"
							height="28"
							loading="lazy"
							referrerpolicy="no-referrer"
						/>{:else}<span class="dot"></span>{/if}
					<b>{h.symbol}</b>
					<span class="small grow line">{h.name}</span>
					<span class="small mono">{short(h.address)}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if reading}<p class="small" role="status">{t.tokens.reading}</p>{/if}
	{#if offer}
		<div class="offer stack">
			<div class="row">
				<Coin asset={asAsset(offer.token)} size={40} />
				<div class="grow">
					<b>{offer.token.symbol}</b>
					<div class="small">
						{offer.name ? `${offer.name} · ` : ''}{t.tokens.decimals(offer.token.decimals)}
					</div>
				</div>
			</div>
			<div class="mono small address">{offer.token.address}</div>
			<div class="notice warn small">{t.tokens.check}</div>
			<div><button class="primary" onclick={add}>{t.tokens.add}</button></div>
		</div>
	{/if}
	{#if problem}<div class="notice danger small" role="alert">{problem}</div>{/if}
	{#if done}<div class="notice info small" role="status">{done}</div>{/if}
	{#if added.length}
		<div class="group">{t.tokens.yours}</div>
		<div class="mine">
			{#each added as tk (tk.address)}
				<div class="row token">
					<Coin asset={asAsset(tk)} size={28} />
					<b>{tk.symbol}</b>
					<span class="small mono grow" title={tk.address}>{short(tk.address)}</span>
					<button
						class="ghost small"
						onclick={() => {
							removeToken(chain!, tk.address);
							forget('evm');
						}}>{t.tokens.remove}</button
					>
				</div>
			{/each}
		</div>
	{/if}
	<p class="small">{t.tokens.note}</p>
</section>

<style>
	.pick select {
		width: auto;
		flex: 1;
		max-width: 320px;
	}
	.hits {
		display: grid;
		border: 1px solid var(--stroke);
		border-radius: 12px;
		overflow: hidden;
	}
	button.plain.hit {
		width: 100%;
		gap: 10px;
		padding: 10px 14px;
		justify-content: flex-start;
		text-align: left;
	}
	.hit + .hit {
		border-top: 1px solid var(--stroke);
	}
	.hit:hover {
		background: color-mix(in srgb, var(--text) 4%, transparent);
		filter: none;
	}
	.hit img,
	.dot {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		flex: none;
		background: var(--raised);
	}
	.line {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.offer {
		padding: 14px;
		border: 1px solid var(--stroke);
		border-radius: 12px;
		background: var(--raised);
	}
	.address {
		overflow-wrap: anywhere;
	}
	.group {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.mine {
		display: grid;
	}
	.token {
		padding: 6px 0;
		border-top: 1px solid var(--stroke);
		gap: 10px;
	}
</style>
