<script lang="ts">
	import type { Asset } from '#lib/chains/index.ts';
	import type { Account } from '#lib/protocol.ts';
	import Home from '#lib/app/Home.svelte';
	import AccountPage from '#lib/app/AccountPage.svelte';
	import Send from '#lib/app/Send.svelte';
	import Connect from '#lib/app/Connect.svelte';
	import Settings from '#lib/app/Settings.svelte';
	import Mark from '#lib/ui/Mark.svelte';
	import { save, setLang, store } from '#lib/state.svelte.ts';
	import { htmlLang, lang, t } from '#lib/i18n/index.svelte.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	/** Mainnet or testnet: never both on screen. Either button leads to that network's Home. */
	function mode(testnet: boolean) {
		if (!!store.settings.testnet !== testnet) {
			store.settings.testnet = testnet;
			save();
		}
		if (view.name !== 'wallet') go({ name: 'wallet' });
	}

	type View =
		| { name: 'wallet' }
		| { name: 'connect' }
		| { name: 'settings' }
		| { name: 'account'; account: Account }
		| { name: 'send'; account: Account; asset: Asset; move?: boolean };
	// Every view is an entry in the browser's history, so Back and Forward move between them.
	// The entry holds the view's place in `trail`; after a reload the trail is gone, and the
	// app starts again from Home.
	let trail = $state.raw<View[]>([{ name: 'wallet' }]);
	const at = $derived(page.state.view ?? 0);
	const view = $derived(trail[at] ?? trail[0]);
	let toast = $state('');
	/** Opens a view, as a new history entry, or in place of this one (`replace`). */
	function go(v: View, replace = false) {
		const next = replace ? at : at + 1;
		trail = [...trail.slice(0, next), v];
		// the same URL, a new history entry: the view starts at the top, focus at its start
		goto(page.url.href, { state: { view: next }, shallow: true, replace, reset: true });
	}
	/** Back to the view before when it is `v`'s kind, otherwise on to `v` in place of this one. */
	function back(v: View) {
		const before = at > 0 ? trail[at - 1] : undefined;
		if (before && before.name === v.name) history.back();
		else go(v, true);
	}
	/** Where the logo leads: the site, or nowhere inside the extension. */
	let { home = '../' }: { home?: string } = $props();

	const other = $derived(lang.current === 'en' ? 'zh' : 'en');
	// the page's language follows the app's; the page left (to the site) gets its own back
	$effect(() => {
		const root = document.documentElement;
		const before = root.lang;
		root.lang = htmlLang(lang.current);
		return () => (root.lang = before);
	});
</script>

<svelte:head><title>Airkeys</title></svelte:head>

<header>
	<!-- the bar spans the window; what is on it lines up with the site's column -->
	<div class="bar">
		<!-- the name is hidden on a phone: the link keeps it -->
		<a class="brand" href={home} aria-label="Airkeys"><Mark size={30} /><b>Airkeys</b></a>
		<div class="mode" role="group" aria-label={t.app.networksShown}>
			<button
				class:on={!store.settings.testnet}
				aria-pressed={!store.settings.testnet}
				onclick={() => mode(false)}>{t.common.mainnet}</button
			>
			<button
				class:on={!!store.settings.testnet}
				aria-pressed={!!store.settings.testnet}
				class="test"
				onclick={() => mode(true)}>{t.common.testnet}</button
			>
		</div>
		<!-- the other language, named in itself -->
		<button
			class="lang"
			lang={htmlLang(other)}
			title={t.app.switchLang}
			onclick={() => setLang(other)}>{t.app.otherLang}</button
		>
		<nav>
			<button
				class:active={view.name === 'wallet'}
				class="ghost"
				onclick={() => go({ name: 'wallet' })}>{t.common.home}</button
			>
			<button
				class:active={view.name === 'settings'}
				class="ghost"
				onclick={() => go({ name: 'settings' })}>{t.app.settings}</button
			>
			<button class="primary" onclick={() => go({ name: 'connect' })}>{t.app.scanPhone}</button>
		</nav>
	</div>
	<!-- in the sticky header, so it sits under the bar whatever the bar's height -->
	{#if store.settings.testnet}
		<div class="testnet">{t.app.testnetBanner}</div>
	{/if}
</header>

<main>
	<!-- a live region from the start, so a reader announces what appears in it -->
	<div role="status">
		{#if toast}<div class="notice info toast">{toast}</div>{/if}
	</div>
	{#if view.name === 'wallet'}
		<Home
			open={(account) => go({ name: 'account', account })}
			move={(account, asset) => go({ name: 'send', account, asset, move: true })}
			connect={() => go({ name: 'connect' })}
			settings={() => go({ name: 'settings' })}
		/>
	{:else if view.name === 'connect'}
		<Connect
			back={() => back({ name: 'wallet' })}
			done={(m) => ((toast = m), back({ name: 'wallet' }), setTimeout(() => (toast = ''), 4000))}
		/>
	{:else if view.name === 'settings'}
		<Settings />
	{:else if view.name === 'account'}
		{@const account = view.account}
		<AccountPage
			{account}
			back={() => back({ name: 'wallet' })}
			send={(asset) => go({ name: 'send', account, asset })}
			tokens={() => go({ name: 'settings' })}
			move={(asset) => go({ name: 'send', account, asset, move: true })}
		/>
	{:else if view.name === 'send'}
		{@const account = view.account}
		{@const moving = !!view.move}
		<Send
			{account}
			asset={view.asset}
			move={moving}
			back={() => back(moving ? { name: 'wallet' } : { name: 'account', account })}
		/>
	{/if}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 2;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--stroke);
	}
	/* the landing page's column (Landing.svelte .wrap) */
	.bar {
		width: min(1120px, 100% - 40px);
		margin-inline: auto;
		display: flex;
		align-items: center;
		gap: 16px;
		padding-block: 14px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-size: 18px;
		text-decoration: none;
	}
	.mode {
		display: flex;
		padding: 3px;
		border-radius: 10px;
		background: var(--surface);
		border: 1px solid var(--stroke);
	}
	.mode button {
		padding: 5px 12px;
		border: 0;
		border-radius: 7px;
		background: none;
		color: var(--dim);
		font-size: 13px;
		font-weight: 600;
	}
	.mode button.on {
		background: var(--raised);
		color: var(--text);
	}
	.mode button.test.on {
		background: color-mix(in srgb, var(--warn) 22%, var(--raised));
		color: var(--warn);
	}
	.lang {
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		color: var(--dim);
		white-space: nowrap;
	}
	.testnet {
		padding: 8px 24px;
		text-align: center;
		font-size: 13px;
		font-weight: 600;
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 12%, var(--bg));
		border-bottom: 1px solid color-mix(in srgb, var(--warn) 30%, var(--stroke));
	}
	nav {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
	nav .active {
		color: var(--text);
		background: var(--raised);
	}
	/* the header's column, so pages start under the logo; a page is at most 920px wide */
	main {
		width: min(1120px, 100% - 40px);
		margin: 0 auto;
		padding: 28px 0 80px;
	}
	main > :global(*) {
		max-width: 920px;
	}
	.toast {
		margin-bottom: 16px;
	}
	@media (max-width: 680px) {
		/* two rows, where one does not fit: the brand, the mode and the language; then the three
		   places, side by side */
		.bar {
			flex-wrap: wrap;
			gap: 10px;
			padding-block: 10px;
		}
		.mode {
			margin-left: auto;
		}
		nav {
			order: 3;
			width: 100%;
			margin-left: 0;
		}
		nav button {
			flex: 1;
			white-space: nowrap;
			padding-inline: 8px;
		}
		.brand b {
			display: none;
		}
	}
	@media (max-width: 640px) {
		/* the site's narrower gutter */
		.bar {
			width: min(1120px, 100% - 32px);
		}
	}
	@media (max-width: 560px) {
		main {
			width: min(1120px, 100% - 32px);
			padding: 18px 0 60px;
		}
	}
</style>
