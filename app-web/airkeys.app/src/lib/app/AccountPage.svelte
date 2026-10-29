<script lang="ts">
	// One account on one network: where to receive, what it holds, whether its key is hidden.
	import { NETWORK_NAMES, explorerLink, path } from '#lib/registry.ts';
	import { addedTokens, bunkerOn, chainsOf, removeAccount } from '#lib/state.svelte.ts';
	import { holdingOf, keepFresh, refresh, ensure } from '#lib/holdings.svelte.ts';
	import { formatShort, formatUnits } from '#lib/units.ts';
	import { money, valueOf } from '#lib/prices.svelte.ts';
	import Coin from '#lib/ui/Coin.svelte';
	import type { Account } from '#lib/protocol.ts';
	import type { Asset } from '#lib/chains/index.ts';
	import Address from '#lib/ui/Address.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Qr from '#lib/ui/Qr.svelte';
	import Exposure from './Exposure.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	let {
		account,
		send,
		move,
		back,
		tokens
	}: {
		account: Account;
		send: (a: Asset) => void;
		move: (a: Asset) => void;
		back: () => void;
		/** Settings, where tokens are added. */
		tokens: () => void;
	} = $props();
	const h = $derived(holdingOf(account));
	// none on a network without a chain in this mode, or with an explorer that is not a web page
	const explorer = $derived(
		explorerLink(chainsOf(account.network)[0]?.explorer.address ?? '', account.address)
	);
	let copied = $state('');
	// a skipped account (past the gap of unused ones) is read when it is opened
	$effect(() => {
		if (holdingOf(account)?.skipped) refresh([account]);
		else ensure(account);
	});
	$effect(() => keepFresh(() => [account]));

	// chains holding something get their own list, the most valuable first; the empty ones share
	// one line
	const shown = $derived((h?.assets ?? []).filter((a) => a.amount > 0n));
	const worthOn = (c: string) =>
		shown.filter((a) => a.chain.name === c).reduce((v, a) => v + (valueOf(a) ?? 0), 0);
	const chains = $derived(
		[...new Set(shown.map((a) => a.chain.name))].sort((x, y) => worthOn(y) - worthOn(x))
	);
	const empty = $derived(
		[...new Set((h?.assets ?? []).map((a) => a.chain.name))].filter((c) => !chains.includes(c))
	);
	const emptyText = $derived(
		empty.length > 4
			? t.home.andMore(empty.slice(0, 3).join(t.common.comma), empty.length - 3)
			: empty.join(t.common.comma)
	);

	/** A token added by hand, not one Airkeys lists. */
	const mine = (a: Asset) =>
		!!a.token &&
		addedTokens(a.chain).some((x) => x.address.toLowerCase() === a.token!.address.toLowerCase());

	async function copy() {
		try {
			await navigator.clipboard.writeText(account.address);
			copied = t.account.copied;
		} catch {
			// no clipboard (an insecure page, or not allowed): the address is on screen
			copied = t.account.notCopied;
		}
		setTimeout(() => (copied = ''), 1500);
	}
</script>

<div class="stack">
	<div class="row">
		<button class="ghost" onclick={back}>← {t.common.home}</button>
		<div class="grow"></div>
		<button class="ghost" onclick={() => refresh([account])} disabled={h?.loading}
			>{h?.loading ? t.account.refreshing : t.common.refresh}</button
		>
	</div>
	<div class="row">
		<Badge network={account.network} size={52} />
		<div class="grow">
			<h2>{t.account.title(NETWORK_NAMES[account.network], account.index)}</h2>
			<div class="small mono">{path(account.network, account.index)}</div>
		</div>
		<Exposure exposure={h?.exposure ?? 'unknown'} loading={!h || h.loading} />
	</div>

	<div class="receive card">
		<Qr value={account.address} size={168} />
		<div class="stack grow">
			<div class="label">{t.account.receiveAt}</div>
			<Address address={account.address} size={17} />
			<div class="row">
				<button onclick={copy}>{copied || t.account.copyAddress}</button>
				{#if explorer}<a class="small" href={explorer} target="_blank" rel="noreferrer"
						>{t.account.explorer}</a
					>{/if}
			</div>
			{#if account.network === 'evm'}<p class="small">{t.account.sameOnEvm}</p>{/if}
		</div>
	</div>

	{#if !bunkerOn()}
		<!-- a plain cold wallet: nothing to warn about -->
	{:else if h?.exposure === 'exposed'}
		<div class="notice warn">
			{t.account.exposedBefore}<b>{t.account.moveAll}</b>{t.account.exposedAfter}
		</div>
	{:else if h?.exposure === 'hidden'}
		<div class="notice info">
			{t.account.hidden}
		</div>
	{/if}

	{#each chains as c (c)}
		<section class="stack">
			{#if account.network === 'evm' || h?.exposure === 'exposed'}
				<div class="row">
					<div class="label grow">{account.network === 'evm' ? c : ''}</div>
					{#if h?.exposure === 'exposed'}
						<button
							class="small"
							onclick={() =>
								move(
									shown.find((a) => a.chain.name === c && !a.token) ??
										shown.find((a) => a.chain.name === c)!
								)}>{t.account.moveAll}</button
						>
					{/if}
				</div>
			{/if}
			<div class="list card">
				{#each shown
					.filter((a) => a.chain.name === c)
					.sort((x, y) => (valueOf(y) ?? -1) - (valueOf(x) ?? -1)) as a (a.key)}
					{@const value = valueOf(a)}
					<div class="asset row">
						<Coin asset={a} size={34} />
						<div class="grow">
							<b>{a.symbol}</b>
							<div class="small" class:mono={!!a.token} title={a.token?.address}>
								{a.token
									? `${a.token.address.slice(0, 6)}…${a.token.address.slice(-4)}${mine(a) ? ` · ${t.tokens.yours}` : ''}`
									: t.account.coin}
							</div>
						</div>
						<div class="right" title={`${formatUnits(a.amount, a.decimals)} ${a.symbol}`}>
							<b
								>{value !== null
									? money(value)
									: `${formatShort(a.amount, a.decimals)} ${a.symbol}`}</b
							>
							{#if value !== null}<div class="small">
									{formatShort(a.amount, a.decimals)}
									{a.symbol}
								</div>{/if}
						</div>
						<button class="small" onclick={() => send(a)}>{t.account.send}</button>
					</div>
				{/each}
			</div>
		</section>
	{/each}
	{#if !chains.length && h && !h.loading && !h.failed.length}
		<div class="card stack empty">
			<b>{t.account.nothingToSend}</b>
			<span class="small"
				>{t.account.holdsNothingBefore(empty.join(t.common.comma))}<b>{t.account.send}</b>{t.account
					.holdsNothingAfter}</span
			>
		</div>
	{:else if chains.length && empty.length && !h?.loading}
		<p class="small">{t.account.nothingOn(emptyText)}</p>
	{/if}
	{#if account.network === 'evm' && h && !h.loading}
		<p class="small">
			{t.tokens.missingBefore}<button class="link" onclick={tokens}>{t.tokens.missingLink}</button
			>{t.tokens.missingAfter}
		</p>
	{/if}
	{#if h?.failed.length}
		<div class="notice warn small" role="status">
			{t.account.unreachable(h.failed.join(t.common.semicolon))}
		</div>
	{/if}
	<div>
		<button class="ghost small" onclick={() => (removeAccount(account), back())}
			>{t.account.remove}</button
		>
	</div>
</div>

<style>
	.receive {
		display: flex;
		gap: 22px;
		align-items: center;
		flex-wrap: wrap;
	}
	/* beside the code while there is room for a whole address line, below it otherwise */
	.receive > .stack {
		flex: 1 1 260px;
	}
	/* "账户 #0" stays together, as "account #0" does */
	h2 {
		word-break: keep-all;
	}
	@media (max-width: 560px) {
		h2 {
			font-size: 20px;
		}
	}
	.list {
		padding: 4px 0;
	}
	button.link {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--lamp);
		display: inline;
	}
	.asset {
		padding: 10px 14px 10px 18px;
		gap: 14px;
	}
	.asset + .asset {
		border-top: 1px solid var(--stroke);
	}
	.asset .grow {
		min-width: 0;
	}
	.right {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.asset button {
		padding: 8px 14px;
	}
</style>
