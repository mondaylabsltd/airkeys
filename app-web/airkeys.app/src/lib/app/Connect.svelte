<script lang="ts">
	import CameraScan from '#lib/lumen/CameraScan.svelte';
	import { parseMessage } from '#lib/protocol.ts';
	import { NETWORK_NAMES } from '#lib/registry.ts';
	import { addAccounts, conflicts, replaceAccounts, store } from '#lib/state.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { Account } from '#lib/protocol.ts';

	let { done, back }: { done: (message: string) => void; back: () => void } = $props();
	let problem = $state('');
	let key = $state(0);
	/** Accounts of another wallet, waiting for the person to choose; the camera is off meanwhile. */
	let pending = $state<{ accounts: Account[]; clash: Account } | null>(null);
	let choice = $state<HTMLElement>();
	// the choice takes the focus, so a keyboard or a screen reader lands on it
	$effect(() => choice?.focus());

	function replace() {
		const n = replaceAccounts(pending!.accounts);
		done(t.connect.replaced(n));
	}

	function received(bytes: Uint8Array) {
		try {
			const m = parseMessage(bytes);
			if (m.type !== 'accounts') throw new Error(t.connect.notAccounts);
			// an account number this browser knows with another address: another wallet, or the
			// same phrase under another passphrase. The two are never mixed.
			const clash = conflicts(m.accounts);
			if (clash.length) {
				pending = { accounts: m.accounts, clash: clash[0] };
				return;
			}
			const n = addAccounts(m.accounts);
			done(n ? t.connect.added(n) : t.connect.already);
		} catch (e) {
			problem = (e as Error).message;
		}
	}
</script>

<div class="stack narrow">
	<div><button class="ghost" onclick={back}>← {t.common.home}</button></div>
	<h2>{t.connect.title}</h2>
	{#if !pending}
		<p class="dim">
			{t.connect.leadBefore}<b>{t.connect.leadConnect}</b>{t.connect.leadMiddle}<b
				>{t.connect.leadShow}</b
			>{t.connect.leadAfter}
		</p>
	{/if}
	{#if pending}
		<div
			class="notice warn stack choice"
			role="alertdialog"
			aria-labelledby="other-wallet"
			aria-describedby="other-wallet-text"
			tabindex="-1"
			bind:this={choice}
		>
			<b id="other-wallet">{t.connect.otherWallet}</b>
			<p id="other-wallet-text">
				{t.connect.otherWalletText(NETWORK_NAMES[pending.clash.network], pending.clash.index)}
			</p>
			<div class="row">
				<button class="primary" onclick={() => done(t.connect.kept)}>{t.connect.keep}</button>
				<button class="danger" onclick={replace}>{t.connect.replace(store.accounts.length)}</button>
			</div>
		</div>
	{:else}
		{#key key}
			<CameraScan onmessage={received} />
		{/key}
	{/if}
	{#if problem}
		<div class="notice danger" role="alert">{problem}</div>
		<div><button onclick={() => ((problem = ''), key++)}>{t.connect.again}</button></div>
	{/if}
</div>

<style>
	.narrow {
		max-width: 560px;
	}
	.choice p {
		margin: 0;
	}
	.choice .row {
		flex-wrap: wrap;
	}
	.choice:focus {
		outline: none;
	}
</style>
