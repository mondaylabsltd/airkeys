<script lang="ts">
	// Endpoints per chain, and EVM chains added by hand. Everything stays in this browser.
	// Self-hosters can point every chain at their own nodes.
	import { registry, type Chain, type Token } from '#lib/registry.ts';
	import { bunkerOn, save, setBunker, store } from '#lib/state.svelte.ts';
	import { isHttpUrl, rpc } from '#lib/chains/net.ts';
	import { DEFAULT_FX, loadCurrencies, prices, refreshPrices } from '#lib/prices.svelte.ts';
	import {
		CHAIN_DATA,
		chainDetails,
		chainIndex,
		searchChains,
		type ChainHit,
		type ChainOffer
	} from '#lib/chainData.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Tokens from './Tokens.svelte';

	let problem = $state('');
	let fxProblem = $state('');
	let fxText = $state(store.settings.fx ?? '');

	async function currencies() {
		fxProblem = '';
		try {
			await loadCurrencies();
		} catch (e) {
			fxProblem = t.settings.currenciesFailed((e as Error).message);
		}
	}
	function setCurrency(code: string) {
		if (code === 'USD') delete store.settings.currency;
		else store.settings.currency = code;
		save();
		void refreshPrices(true);
	}
	function setFx() {
		const url = fxText.trim();
		if (url && !isHttpUrl(url)) {
			fxProblem = t.settings.enterUrl;
			return;
		}
		fxProblem = '';
		if (url) store.settings.fx = url;
		else delete store.settings.fx;
		save();
		prices.currencies = ['USD'];
		void refreshPrices(true);
	}
	let added = $state('');
	/** "Forget all accounts" asks first, on the page; then says it is done. */
	let forgetting = $state(false);
	let forgotten = $state(false);
	/** Endpoint rows open for editing, and what is wrong with what was typed in each. */
	let editing = $state<Record<string, boolean>>({});
	let wrong = $state<Record<string, string>>({});
	let custom = $state({ name: '', chainId: '', symbol: '', rpc: '', explorer: '' });

	// adding a chain: search the chains of ethereum-data.getvela.app, or enter one by hand
	let query = $state('');
	let all = $state<ChainHit[]>([]);
	let searching = $state('');
	let offer = $state<ChainOffer | null>(null);
	let picked = $state<Record<string, boolean>>({});
	let loadingOffer = $state(false);
	let byHand = $state(false);
	const known = (id: number) =>
		[...registry.evm, ...store.settings.chains].some((c) => c.chainId === id);
	const hits = $derived(searchChains(all, query));

	async function startSearch() {
		if (all.length || searching === 'loading') return;
		searching = 'loading';
		try {
			all = await chainIndex();
			searching = '';
		} catch {
			searching = t.settings.listFailed(new URL(CHAIN_DATA).host);
		}
	}

	async function pick(hit: ChainHit) {
		problem = added = '';
		offer = null;
		loadingOffer = true;
		try {
			offer = await chainDetails(hit.chainId);
			picked = Object.fromEntries(offer.tokens.map((x) => [x.address, true]));
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			loadingOffer = false;
		}
	}

	function addOffer() {
		if (!offer) return;
		const tokens: Token[] = offer.tokens.filter((x) => picked[x.address]);
		store.settings.chains.push({ ...offer.chain, tokens });
		save();
		added = t.settings.addedChain(offer.chain.name, !!offer.chain.testnet);
		offer = null;
		query = '';
	}

	type Row = { key: string; name: string; chain: Chain; kind: string };
	const rows = $derived<Row[]>([
		{ key: 'bitcoin', name: 'Bitcoin', chain: registry.bitcoin, kind: 'Esplora API' },
		...[...registry.evm, ...store.settings.chains].map((c) => ({
			key: `evm:${c.chainId}`,
			name: c.name,
			chain: c,
			kind: 'JSON-RPC'
		}))
	]);
	// the networks of the mode on screen first; the others folded away until asked for
	const testnet = $derived(!!store.settings.testnet);
	const here = $derived(rows.filter((r) => !!r.chain.testnet === testnet));
	const there = $derived(rows.filter((r) => !!r.chain.testnet !== testnet));

	/** A web page's host, or nothing: the data comes from a third party. */
	const host = (url: string) => {
		try {
			return new URL(url).host;
		} catch {
			return '';
		}
	};

	function set(key: string, value: string) {
		const url = value.trim();
		if (url && !isHttpUrl(url)) {
			wrong[key] = t.settings.enterUrl;
			return;
		}
		delete wrong[key];
		if (url) store.settings.rpc[key] = url;
		else delete store.settings.rpc[key];
		save();
	}

	async function addChain() {
		problem = added = '';
		try {
			const id = Number(custom.chainId);
			if (!Number.isInteger(id) || id <= 0) throw new Error(t.settings.enterChainId);
			if ([...registry.evm, ...store.settings.chains].some((c) => c.chainId === id))
				throw new Error(t.settings.alreadyListed);
			const endpoint = custom.rpc.trim();
			if (!isHttpUrl(endpoint)) throw new Error(t.settings.enterRpc);
			const ex = custom.explorer.trim().replace(/\/$/, '');
			if (ex && !isHttpUrl(ex)) throw new Error(t.settings.enterExplorer);
			const answered = Number(BigInt(await rpc<string>(endpoint, 'eth_chainId')));
			if (answered !== id) throw new Error(t.settings.wrongChain(answered, id));
			store.settings.chains.push({
				chainId: id,
				name: custom.name || `Chain ${id}`,
				symbol: custom.symbol || 'ETH',
				decimals: 18,
				rpc: endpoint,
				explorer: ex ? { tx: `${ex}/tx/{}`, address: `${ex}/address/{}` } : { tx: '', address: '' },
				tokens: []
			});
			save();
			added = t.settings.addedChain(custom.name || t.settings.chain(id), false);
			custom = { name: '', chainId: '', symbol: '', rpc: '', explorer: '' };
		} catch (e) {
			problem = (e as Error).message;
		}
	}

	function removeChain(c: Chain) {
		const key = `evm:${c.chainId}`;
		store.settings.chains = store.settings.chains.filter((x) => x.chainId !== c.chainId);
		delete store.settings.rpc[key];
		delete editing[key];
		delete wrong[key];
		save();
	}
</script>

{#snippet network(r: Row)}
	<div class="net">
		<div class="row">
			<b>{r.name}</b>
			<span class="small grow"
				>{r.chain.symbol}{r.chain.chainId !== undefined ? ` · ${r.chain.chainId}` : ''}</span
			>
			{#if store.settings.rpc[r.key]}<span class="pill dim">{t.settings.ownEndpoint}</span>{/if}
			<button
				class="ghost small"
				aria-expanded={!!editing[r.key]}
				onclick={() => (editing[r.key] = !editing[r.key])}>{t.settings.endpointButton}</button
			>
			{#if store.settings.chains.includes(r.chain)}<button
					class="ghost small"
					onclick={() => removeChain(r.chain)}>{t.settings.remove}</button
				>{/if}
		</div>
		{#if editing[r.key]}
			<input
				value={store.settings.rpc[r.key] ?? ''}
				placeholder={`${r.kind}: ${r.chain.rpc}`}
				aria-label={t.settings.endpointLabel(r.name, r.kind)}
				onchange={(e) => set(r.key, e.currentTarget.value)}
				spellcheck="false"
			/>
			{#if wrong[r.key]}<div class="notice danger small" role="alert">
					{wrong[r.key]}
				</div>{/if}
		{/if}
	</div>
{/snippet}

<div class="stack narrow">
	<h2>{t.settings.title}</h2>
	<section class="card stack">
		<div class="label">{t.bunker.title}</div>
		<label class="row switch">
			<input
				type="checkbox"
				role="switch"
				checked={bunkerOn()}
				onchange={(e) => setBunker(e.currentTarget.checked)}
			/>
			<b class="grow">{t.bunker.label}</b>
		</label>
		<p class="small">{bunkerOn() ? t.bunker.on : t.bunker.off}</p>
	</section>
	<section class="card stack">
		<div class="label">{t.settings.networks}</div>
		<input
			class="search"
			bind:value={query}
			onfocus={startSearch}
			placeholder={t.settings.search}
			aria-label={t.settings.searchLabel}
			spellcheck="false"
			autocomplete="off"
		/>
		{#if searching && searching !== 'loading'}<div class="notice warn small" role="status">
				{searching}
			</div>{/if}
		{#if query && hits.length}
			<div class="hits">
				{#each hits as h (h.chainId)}
					<button class="hit" disabled={known(h.chainId)} onclick={() => pick(h)}>
						<span class="grow"
							><b>{h.name}</b>
							<span class="small">· {h.symbol} · {t.settings.chain(h.chainId)}</span></span
						>
						{#if h.testnet}<span class="pill warn">{t.common.testnet}</span>{/if}
						{#if known(h.chainId)}<span class="small">{t.settings.listed}</span>{/if}
					</button>
				{/each}
			</div>
		{:else if query && all.length}
			<p class="small">{t.settings.noMatch(query)}</p>
		{/if}
		{#if loadingOffer}<p class="small" role="status">{t.settings.checkingEndpoints}</p>{/if}
		{#if offer}
			<div class="offer stack">
				<div class="row">
					<b class="grow">{offer.chain.name}</b>
					{#if offer.chain.testnet}<span class="pill warn">{t.common.testnet}</span>{:else}<span
							class="pill">{t.common.mainnet}</span
						>{/if}
				</div>
				<div class="small">
					{t.settings.chainCap(offer.chain.chainId!)} · {offer.chain.symbol} · {t.settings.endpoint}
					<span class="mono">{offer.chain.rpc}</span>
					{t.settings.answered}{host(offer.chain.explorer.tx)
						? t.settings.explorer(host(offer.chain.explorer.tx))
						: ''}
				</div>
				{#if offer.tokens.length}
					<div class="small">{t.settings.tokens}</div>
					{#each offer.tokens as token (token.address)}
						<label class="row token">
							<input type="checkbox" bind:checked={picked[token.address]} />
							<b>{token.symbol}</b><span class="mono small grow">{token.address}</span>
						</label>
					{/each}
				{/if}
				<div>
					<button class="primary" onclick={addOffer}>{t.settings.add(offer.chain.name)}</button>
				</div>
			</div>
		{/if}
		<p class="small">
			{t.settings.sourceBefore}<a href={CHAIN_DATA} target="_blank" rel="noreferrer"
				>{new URL(CHAIN_DATA).host}</a
			>{t.settings.sourceAfter}
			<button class="ghost small" aria-expanded={byHand} onclick={() => (byHand = !byHand)}
				>{byHand ? t.settings.hide : t.settings.byHand}</button
			>
		</p>
		{#if byHand}
			<div class="grid">
				<input
					bind:value={custom.name}
					placeholder={t.settings.name}
					aria-label={t.settings.name}
				/>
				<input
					bind:value={custom.chainId}
					placeholder={t.settings.chainId}
					aria-label={t.settings.chainId}
					inputmode="numeric"
				/>
				<input
					bind:value={custom.symbol}
					placeholder={t.settings.symbol}
					aria-label={t.settings.symbol}
				/>
				<input
					bind:value={custom.rpc}
					placeholder={t.settings.rpcUrl}
					aria-label={t.settings.rpcUrl}
				/>
				<input
					class="wide"
					bind:value={custom.explorer}
					placeholder={t.settings.explorerPlaceholder}
					aria-label={t.settings.explorerUrl}
				/>
			</div>
			<div><button class="primary" onclick={addChain}>{t.settings.addChain}</button></div>
		{/if}
		{#if problem}<div class="notice danger" role="alert">{problem}</div>{/if}
		{#if added}<div class="notice info" role="status">{added}</div>{/if}
		<div class="group">{testnet ? t.common.testnet : t.common.mainnet}</div>
		<div class="nets">
			{#each here as r (r.key)}{@render network(r)}{/each}
		</div>
		{#if there.length}
			<details class="other">
				<summary class="group">
					{testnet ? t.common.mainnet : t.common.testnet} · {there.length}
				</summary>
				<div class="nets">
					{#each there as r (r.key)}{@render network(r)}{/each}
				</div>
			</details>
		{/if}
		<p class="small">{t.settings.endpointsNote}</p>
	</section>
	<Tokens />
	<section class="card stack">
		<div class="label">{t.settings.prices}</div>
		<label class="row">
			<span class="grow">{t.settings.showIn}</span>
			<select
				class="currency"
				value={store.settings.currency ?? 'USD'}
				onfocus={currencies}
				onchange={(e) => setCurrency(e.currentTarget.value)}
			>
				{#each prices.currencies.includes(store.settings.currency ?? 'USD') ? prices.currencies : [store.settings.currency ?? 'USD', ...prices.currencies] as c (c)}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</label>
		<p class="small">
			{t.settings.pricesBefore}<span class="mono"
				>{new URL(store.settings.fx || DEFAULT_FX).host}</span
			>{t.settings.pricesAfter}
		</p>
		<label class="stack tight">
			<span class="small">{t.settings.fxLabel}</span>
			<input bind:value={fxText} onchange={setFx} placeholder={DEFAULT_FX} spellcheck="false" />
		</label>
		{#if fxProblem}<div class="notice warn small" role="status">{fxProblem}</div>{/if}
	</section>
	<section class="card stack">
		<div class="label">{t.settings.browser}</div>
		<p class="small">{t.settings.browserNote}</p>
		{#if forgetting}
			<div class="notice warn stack" role="alertdialog" aria-describedby="forget-text">
				<p id="forget-text">{t.settings.forgetConfirm}</p>
				<div class="row wrap">
					<!-- svelte-ignore a11y_autofocus -->
					<button autofocus onclick={() => (forgetting = false)}>{t.settings.keepAccounts}</button>
					<button
						class="danger"
						onclick={() => {
							store.accounts = [];
							save();
							forgetting = false;
							forgotten = true;
						}}>{t.settings.forget}</button
					>
				</div>
			</div>
		{:else}
			<div>
				<button class="danger" onclick={() => ((forgetting = true), (forgotten = false))}
					>{t.settings.forget}</button
				>
			</div>
			{#if forgotten}<p class="small" role="status">{t.settings.forgotten}</p>{/if}
		{/if}
	</section>
</div>

<style>
	.currency {
		width: auto;
		min-width: 110px;
	}
	.tight {
		gap: 6px;
	}
	.narrow {
		max-width: 680px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.wide {
		grid-column: span 2;
	}
	.group {
		margin-top: 8px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.nets {
		display: grid;
	}
	.switch {
		cursor: pointer;
		gap: 12px;
	}
	.switch input {
		width: 20px;
		height: 20px;
		accent-color: var(--lamp);
		flex: none;
	}
	.wrap {
		flex-wrap: wrap;
	}
	.notice p {
		margin: 0;
	}
	.other summary {
		cursor: pointer;
		padding: 6px 0;
	}
	.net .small {
		margin-left: 4px;
	}
	.net {
		display: grid;
		gap: 6px;
		padding: 4px 0;
		border-top: 1px solid var(--stroke);
	}
	.net .row {
		min-height: 40px;
	}
	.hits {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.hit {
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
		font: inherit;
		padding: 10px 12px;
	}
	.offer {
		padding: 14px;
		border-radius: 12px;
		background: var(--raised);
	}
	.token {
		gap: 10px;
		align-items: center;
	}
</style>
