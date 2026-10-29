<script lang="ts">
	// The home screen: what the wallet holds, worth what; how much of it sits behind keys never
	// revealed (the bunker) and how much behind keys that have signed (to move, one signing per
	// chain); every asset across accounts and chains; and, folded, every account.
	import type { Asset } from '#lib/chains/index.ts';
	import type { Account } from '#lib/protocol.ts';
	import type { Chain, Network } from '#lib/registry.ts';
	import { bunkerOn, nextPage, store } from '#lib/state.svelte.ts';
	import { ensure, holdingOf, keepFresh, refresh } from '#lib/holdings.svelte.ts';
	import { currency, money, prices, refreshPrices, valueOf } from '#lib/prices.svelte.ts';
	import { sameChain, summarize, type Holder, type ToMove } from '#lib/value.ts';
	import { formatShort } from '#lib/units.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Coin from '#lib/ui/Coin.svelte';
	import Exposure from './Exposure.svelte';
	import Wallet from './Wallet.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	let {
		open,
		move,
		connect,
		settings
	}: {
		open: (a: Account) => void;
		move: (a: Account, asset: Asset) => void;
		connect: () => void;
		settings: () => void;
	} = $props();

	const testnet = $derived(!!store.settings.testnet);
	/** Unused accounts left before Home asks for the next page. */
	const FEW = 5;
	// Bitcoin has no test network here
	const order = $derived<Network[]>(testnet ? ['evm'] : ['bitcoin', 'evm']);
	const accounts = $derived(store.accounts.filter((a) => order.includes(a.network)));
	$effect(() => ensure(...accounts));
	$effect(() => {
		if (!testnet) void refreshPrices();
	});
	// balances and prices stay current while Home is open
	$effect(() =>
		keepFresh(
			() => accounts,
			true,
			() => void refreshPrices()
		)
	);

	const holders = $derived<Holder[]>(
		accounts.flatMap((account) => {
			const h = holdingOf(account);
			// past the gap of unused Bitcoin accounts: not read, so not counted
			if (!h || h.skipped) return [];
			return [
				{ account, assets: h.assets, exposure: h.exposure, partial: h.loading || !!h.failed.length }
			];
		})
	);
	const sum = $derived(summarize(holders, valueOf));
	const reading = $derived(accounts.filter((a) => !holdingOf(a) || holdingOf(a)!.loading).length);
	// the chains that did not answer, each once: their balances are not in the figures
	const unreachable = $derived([
		...new Set(accounts.flatMap((a) => holdingOf(a)?.failed ?? []).map((f) => f.split(':')[0]))
	]);
	const priced = $derived(!testnet && prices.rate !== null && Object.keys(prices.usd).length > 0);
	// never a confidently wrong figure: nothing known yet is a placeholder, not "$0"
	const known = $derived(priced && (reading < accounts.length || sum.total > 0));

	// bunker mode off: a plain cold wallet, which asks nothing to move and receives at one account
	const bunker = $derived(bunkerOn());
	// where to receive: the lowest account whose key is still hidden; without bunker mode, the
	// lowest account
	const receiveAt = (n: Network) =>
		accounts
			.filter((a) => a.network === n && (!bunker || holdingOf(a)?.exposure === 'hidden'))
			.sort((a, b) => a.index - b.index)[0];

	// the asset list: every chain, or one
	let filter = $state<string | null>(null);
	const chainLabel = (c: Chain) => (c.chainId === undefined ? 'Bitcoin' : c.name);
	const chains = $derived([...new Set(sum.lines.map((l) => chainLabel(l.asset.chain)))]);
	const lines = $derived(
		filter ? sum.lines.filter((l) => chainLabel(l.asset.chain) === filter) : sum.lines
	);
	let opened = $state<string | null>(null);

	/** The chain's own coin, for Send to name the chain by (an account may hold only tokens). */
	function coinOf(m: ToMove): Asset {
		return (
			holdingOf(m.account)?.assets.find((a) => !a.token && sameChain(a.chain, m.chain)) ??
			m.assets[0]
		);
	}
	const amountText = (a: Asset, amount = a.amount) =>
		`${formatShort(amount, a.decimals)} ${a.symbol}`;
	const worth = (v: number | null) => (v === null ? '' : money(v));
	const place = (a: Account) => `${a.network === 'bitcoin' ? 'Bitcoin' : 'EVM'} #${a.index}`;

	// bunker mode moves funds to unused accounts: none, or few, left among those connected means
	// connecting the next page of accounts on the phone
	const unused = (n: Network) =>
		accounts.filter((a) => {
			const h = a.network === n ? holdingOf(a) : undefined;
			return (
				!!h && !h.loading && !h.skipped && !h.failed.length && !h.used && h.exposure === 'hidden'
			);
		}).length;
	const shown = $derived(order.filter((n) => accounts.some((a) => a.network === n)));
	const noHidden = $derived(shown.filter((n) => !receiveAt(n)));
	const fewFresh = $derived(shown.filter((n) => unused(n) > 0 && unused(n) < FEW));
	/** The next page for these networks: past the highest account connected on any of them. */
	const later = (ns: Network[]) => ns.map(nextPage).reduce((a, b) => (b.start > a.start ? b : a));

	// the coins without a price, a few by name
	const unpriced = $derived(
		sum.unpriced.length > 4
			? t.home.andMore(sum.unpriced.slice(0, 3).join(t.common.comma), sum.unpriced.length - 3)
			: sum.unpriced.join(t.common.comma)
	);
	// moves worth less than one unit of the currency wait in a group of their own; those
	// without a price stay in view, as they may be worth anything
	const small = (m: ToMove) => m.value !== null && m.value < 1;
	const moves = $derived(sum.toMove.filter((m) => !small(m)));
	const smallMoves = $derived(sum.toMove.filter(small));

	function reload() {
		void refresh(accounts, true);
		if (!testnet) void refreshPrices(true);
	}
</script>

{#snippet accountList()}
	<details class="accounts" open={!bunker}>
		<summary class="label">{t.home.accounts} · {accounts.length}</summary>
		<Wallet {open} {connect} />
	</details>
{/snippet}

{#snippet moveRow(m: ToMove)}
	<div class="card row move">
		<Coin asset={coinOf(m)} size={34} />
		<button class="plain grow" onclick={() => open(m.account)}>
			<b class="line">{place(m.account)} · {chainLabel(m.chain)}</b>
			{#if m.value !== null}<span class="inline-value">{money(m.value)}</span>{/if}
			<span class="small line"
				>{m.assets
					.slice(0, 3)
					.map((a) => amountText(a))
					.join(t.common.comma)}{m.assets.length > 3 ? ` +${m.assets.length - 3}` : ''}</span
			>
		</button>
		{#if m.value !== null}<b class="value">{money(m.value)}</b>{/if}
		<button class="primary" onclick={() => move(m.account, coinOf(m))}>{t.home.move}</button>
	</div>
{/snippet}

{#if !store.accounts.length}
	<Wallet {open} {connect} />
{:else}
	<div class="stack">
		<section class="hero card">
			<div class="row top">
				<span class="label grow">{t.home.total}{priced ? ` · ${currency()}` : ''}</span>
				<button class="ghost small" onclick={reload} disabled={reading > 0 || prices.loading}
					>{reading > 0 ? t.home.readingLeft(reading) : t.common.refresh}</button
				>
			</div>
			{#if testnet}
				<div class="figure muted">{t.home.testCoins}</div>
				<p class="small">{t.home.testUnpriced}</p>
			{:else if known}
				<div class="figure">{money(sum.total)}</div>
			{:else}
				<div class="figure skeleton" aria-label={t.home.readingBalances}></div>
			{/if}
			{#if !testnet && (unreachable.length || sum.unpriced.length || prices.failed.length)}
				<p class="small">
					{#if unreachable.length}{t.home.notCountedBefore(unreachable.join(t.common.comma))}<button
							class="link"
							onclick={settings}>{t.home.endpoints}</button
						>{t.home.notCountedAfter}{/if}
					{#if sum.unpriced.length}{t.home.noPrice(unpriced)}{/if}
					{#if prices.failed.length}{t.home.couldNotRead(
							prices.failed.join(t.common.semicolon)
						)}{/if}
				</p>
			{/if}

			{#if bunker}
				<div class="tiles">
					<div class="tile bunker">
						<div class="row tight">
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path
									d="M9 12l2 2 4-4"
								/></svg
							><b>{t.home.bunker}</b>
						</div>
						<div class="amount">{priced ? money(sum.bunker) : sum.bunkerAccounts ? '—' : '0'}</div>
						<div class="small">{t.home.bunkerNote(sum.bunkerAccounts)}</div>
					</div>
					<div class="tile" class:exposed={sum.toMove.length > 0}>
						<div class="row tight">
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg
							><b>{t.home.exposed}</b>
						</div>
						<div class="amount">
							{priced ? money(sum.exposed) : sum.exposedAccounts ? '—' : '0'}
						</div>
						<div class="small">
							{sum.toMove.length ? t.home.toMoveNote(sum.toMove.length) : t.home.nothingExposed}
						</div>
					</div>
				</div>
			{/if}

			<div class="row actions">
				{#each order as n (n)}
					{@const at = receiveAt(n)}
					<button class="primary grow" disabled={!at} onclick={() => at && open(at)}
						>{n === 'bitcoin' ? t.home.receiveBitcoin : t.home.receiveEvm}</button
					>
				{/each}
			</div>
			{#if bunker && reading === 0 && noHidden.length}
				{@const p = later(noHidden)}
				<p class="small">
					{t.home.noHiddenBefore(
						noHidden.map((n) => (n === 'bitcoin' ? 'Bitcoin' : 'EVM')).join(t.common.or),
						p.start,
						p.end
					)}<button class="link" onclick={connect}>{t.home.scanIt}</button>{t.home.noHiddenAfter}
				</p>
			{:else if bunker && reading === 0 && fewFresh.length}
				{@const n = fewFresh[0]}
				{@const p = later([n])}
				<p class="small">
					{t.home.fewFreshBefore(
						n === 'bitcoin' ? 'Bitcoin' : 'EVM',
						unused(n),
						p.start,
						p.end
					)}<button class="link" onclick={connect}>{t.home.scanIt}</button>{t.home.noHiddenAfter}
				</p>
			{/if}
		</section>

		{#if bunker && sum.toMove.length}
			<section class="stack tight">
				<div class="label">{t.home.toMove}</div>
				<p class="small">{t.home.toMoveLead}</p>
				{#each moves as m (m.account.address + chainLabel(m.chain))}
					{@render moveRow(m)}
				{/each}
				{#if smallMoves.length}
					<details class="small-moves">
						<summary class="small">{t.home.smallMoves(smallMoves.length, money(1))}</summary>
						<div class="stack tight">
							{#each smallMoves as m (m.account.address + chainLabel(m.chain))}
								{@render moveRow(m)}
							{/each}
						</div>
					</details>
				{/if}
			</section>
		{/if}

		<!-- a plain cold wallet: the accounts come first, open, as nothing else leads to them -->
		{#if !bunker}{@render accountList()}{/if}

		<section class="stack tight">
			<div class="row">
				<div class="label grow">{t.home.assets}</div>
			</div>
			{#if chains.length > 1}
				<div class="chips" role="group" aria-label={t.home.showAssetsOf}>
					<button
						class:on={filter === null}
						aria-pressed={filter === null}
						onclick={() => (filter = null)}>{t.home.all}</button
					>
					{#each chains as c (c)}
						<button class:on={filter === c} aria-pressed={filter === c} onclick={() => (filter = c)}
							>{c}</button
						>
					{/each}
				</div>
			{/if}
			{#if !lines.length}
				<div class="card small">
					{reading ? t.home.readingBalancesDots : t.home.nothingHeld}
				</div>
			{/if}
			<div class="list card">
				{#each lines as l (l.key)}
					<button
						class="plain asset"
						aria-expanded={opened === l.key}
						onclick={() => (opened = opened === l.key ? null : l.key)}
					>
						<Coin asset={l.asset} />
						<span class="grow">
							<b>{l.asset.symbol}</b>
							<span class="small line"
								>{chainLabel(l.asset.chain)} · {t.home.accountsCount(l.holders.length)}</span
							>
						</span>
						<span class="right">
							<b>{l.value !== null ? money(l.value) : amountText(l.asset, l.amount)}</b>
							{#if l.value !== null}<span class="small line">{amountText(l.asset, l.amount)}</span
								>{/if}
						</span>
					</button>
					{#if opened === l.key}
						<div class="holders">
							{#each l.holders as h (h.account.address)}
								<button class="plain holder" onclick={() => open(h.account)}>
									<span class="grow">{place(h.account)}</span>
									<span class="small"
										>{amountText(l.asset, h.amount)}{h.value !== null
											? ` · ${worth(h.value)}`
											: ''}</span
									>
									<Exposure exposure={h.exposure} />
								</button>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		</section>

		{#if bunker}{@render accountList()}{/if}
	</div>
{/if}

<style>
	.small-moves summary {
		cursor: pointer;
		padding: 6px 2px;
	}
	.small-moves[open] summary {
		margin-bottom: 8px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 22px;
		background:
			radial-gradient(
				120% 90% at 0% 0%,
				color-mix(in srgb, var(--lamp) 9%, transparent),
				transparent 60%
			),
			var(--surface);
	}
	.top button {
		padding: 4px 8px;
	}
	.figure {
		font-size: 44px;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.figure.muted {
		color: var(--dim);
		font-size: 32px;
	}
	.skeleton {
		width: 220px;
		height: 48px;
		border-radius: 10px;
		background: linear-gradient(90deg, var(--raised), var(--stroke), var(--raised));
		background-size: 200% 100%;
		animation: shimmer 1.4s infinite linear;
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}
	}
	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.tile {
		padding: 14px;
		border-radius: 12px;
		border: 1px solid var(--stroke);
		background: var(--raised);
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.tile svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.tile.bunker .row {
		color: var(--safe);
	}
	.tile .row {
		color: var(--dim);
	}
	.tile.exposed {
		border-color: color-mix(in srgb, var(--warn) 40%, var(--stroke));
		background: color-mix(in srgb, var(--warn) 7%, var(--raised));
	}
	.tile.exposed .row {
		color: var(--warn);
	}
	.tile .amount {
		font-size: 22px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.tight {
		gap: 8px;
	}
	.actions button:disabled {
		opacity: 0.5;
	}
	button.plain {
		appearance: none;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		display: flex;
		align-items: center;
		gap: 12px;
		border-radius: 0;
	}
	button.plain.grow {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-width: 0;
		overflow: hidden;
	}
	button.plain.grow > * {
		max-width: 100%;
	}
	button.link {
		appearance: none;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--lamp);
		display: inline;
	}
	.line {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.move .value {
		font-variant-numeric: tabular-nums;
	}
	.move .plain {
		min-width: 0;
	}
	/* on a phone the value goes under the name, which keeps its one line */
	.inline-value {
		display: none;
	}
	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: none;
	}
	.chips button {
		padding: 6px 12px;
		border-radius: 999px;
		font-size: 13px;
		white-space: nowrap;
		color: var(--dim);
	}
	.chips button.on {
		color: var(--text);
		border-color: var(--lamp);
		background: color-mix(in srgb, var(--lamp) 10%, var(--raised));
	}
	.list {
		padding: 4px 0;
	}
	.list:empty {
		display: none;
	}
	button.plain.asset {
		width: 100%;
		padding: 12px 18px;
	}
	.asset + .asset,
	.holders + .asset {
		border-top: 1px solid var(--stroke);
	}
	.asset:hover,
	.holder:hover {
		background: color-mix(in srgb, var(--text) 3%, transparent);
		filter: none;
	}
	.asset .grow {
		min-width: 0;
	}
	.right {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.holders {
		padding: 0 18px 10px 66px;
		display: flex;
		flex-direction: column;
	}
	button.plain.holder {
		width: 100%;
		padding: 8px 0;
		gap: 10px;
	}
	.holder + .holder {
		border-top: 1px dashed var(--stroke);
	}
	.accounts summary {
		cursor: pointer;
		padding: 6px 0 14px;
	}
	@media (max-width: 560px) {
		.figure {
			font-size: 36px;
		}
		.tiles {
			grid-template-columns: 1fr;
		}
		.actions {
			flex-direction: column;
			align-items: stretch;
		}
		.holders {
			padding-left: 18px;
		}
		.move .value {
			display: none;
		}
		.inline-value {
			display: block;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}
	}
</style>
