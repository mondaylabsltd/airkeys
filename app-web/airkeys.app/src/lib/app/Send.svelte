<script lang="ts">
	// A transfer, end to end: the form, the request shown to the phone, the phone's signed reply,
	// and broadcasting. The phone checks everything again and shows it before it signs.
	import {
		broadcast,
		prepare,
		type Asset,
		type Broadcast,
		type Prepared
	} from '#lib/chains/index.ts';
	import { encode, isIndex, parseMessage, type Account, type Signed } from '#lib/protocol.ts';
	import { explorerLink, NETWORK_NAMES } from '#lib/registry.ts';
	import { addAccounts, bunkerOn, nextPage, store } from '#lib/state.svelte.ts';
	import { ensure, freshIndex, holdingOf, refresh } from '#lib/holdings.svelte.ts';
	import { parseAddress } from '#lib/addresses.ts';
	import { formatShort, formatUnits, parseUnits } from '#lib/units.ts';
	import { elsewhere } from '#lib/value.ts';
	import { money, valueOf } from '#lib/prices.svelte.ts';
	import CodeCanvas from '#lib/lumen/CodeCanvas.svelte';
	import Json from '#lib/ui/Json.svelte';
	import CameraScan from '#lib/lumen/CameraScan.svelte';
	import { onDestroy } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	let {
		account,
		asset,
		back,
		move = false
	}: { account: Account; asset: Asset; back: () => void; move?: boolean } = $props();

	type Step = 'form' | 'review' | 'request' | 'reply' | 'done';
	let step = $state<Step>('form');
	let to = $state('');
	let amountText = $state('');
	let max = $state(false);
	let speed = $state<0 | 1 | 2>(1);
	const exposure = $derived(holdingOf(account)?.exposure);
	// Bitcoin change always goes to a fresh account; on EVM chains moving the rest is the
	// default in bunker mode (the first send reveals the key), leaving it in a plain cold wallet
	const bunker = bunkerOn();
	let moveRest = $state(bunker);
	// the lowest connected account seen unused — recomputed as balances arrive, until the person
	// types another number
	let typed = $state<number | null>(null);
	const fresh = $derived(typed ?? freshIndex(account.network, account.index));
	$effect(() => {
		// read every connected account, so the fresh one can be found
		ensure(...store.accounts.filter((a) => a.network === account.network));
	});
	let problem = $state('');
	let busy = $state(false);
	let prepared = $state<Prepared | null>(null);
	// the phone's reply, kept until every transaction in it is sent
	let signed = $state.raw<Signed | null>(null);
	let results = $state<Broadcast[]>([]);
	let later: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(later));

	const holdings = $derived(
		(holdingOf(account)?.assets ?? []).filter(
			// one chain: by chain id (a chain added by hand may share a listed chain's name)
			(a) => a.chain.chainId === asset.chain.chainId && a.chain.name === asset.chain.name
		)
	);

	// a first send on one EVM chain reveals the key on every EVM chain: what else is at stake
	const others = $derived(
		account.network === 'evm' && !move && exposure === 'hidden'
			? elsewhere(holdingOf(account)?.assets ?? [], asset.chain)
			: []
	);
	const list = (assets: Asset[]) =>
		assets.map((a) => `${formatShort(a.amount, a.decimals)} ${a.symbol}`).join(t.common.comma);
	/** "Base (≈ $30,512), Polygon (≈ $3,401), Arbitrum One (≈ $1,540) and 3 more chains":
	 * the costliest first; a chain without prices is named with what it holds. */
	const atStake = $derived.by(() => {
		const rows = others
			.map((o) => {
				const vs = o.assets.map(valueOf);
				const v = vs.every((x) => x === null)
					? null
					: vs.reduce<number>((sum, x) => sum + (x ?? 0), 0);
				return { name: o.chain.name, v, text: v === null ? list(o.assets) : `≈ ${money(v)}` };
			})
			.sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
		const shown = rows.slice(0, 3).map((r) => t.send.chainWith(r.name, r.text));
		const more = rows.length - shown.length;
		return shown.join(t.common.comma) + (more ? t.send.moreChains(more) : '');
	});

	async function review() {
		problem = '';
		if (move) return reviewMove();
		try {
			const recipient = parseAddress(account.network, to);
			const amount = max ? null : parseUnits(amountText, asset.decimals);
			if (!max && (amount === null || amount <= 0n)) throw new Error(t.send.enterAmount);
			// Bitcoin change goes to a fresh account in bunker mode, back to this one otherwise
			const needsFresh = account.network === 'bitcoin' ? bunker : moveRest;
			if (needsFresh && fresh === null) {
				const p = nextPage(account.network);
				throw new Error(t.send.noFreshRest(p.start, p.end));
			}
			if (needsFresh && !isIndex(fresh)) throw new Error(t.send.badIndex);
			if (moveRest && fresh === account.index) throw new Error(t.send.restElsewhere);
			busy = true;
			prepared = await prepare(account.network, {
				from: account,
				asset,
				to: recipient,
				amount,
				moveRest:
					!needsFresh && account.network === 'bitcoin' ? account.index : needsFresh ? fresh : null,
				holdings,
				speed
			});
			step = 'review';
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function reviewMove() {
		try {
			if (fresh === null) {
				const p = nextPage(account.network);
				throw new Error(t.send.noFreshMove(p.start, p.end));
			}
			if (!isIndex(fresh)) throw new Error(t.send.badIndex);
			if (fresh === account.index) throw new Error(t.send.moveElsewhere);
			busy = true;
			prepared = await prepare(account.network, {
				from: account,
				asset,
				to: '',
				amount: null,
				moveRest: fresh,
				moveAll: true,
				holdings,
				speed
			});
			step = 'review';
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function replied(bytes: Uint8Array) {
		problem = '';
		try {
			const m = parseMessage(bytes);
			if (m.type !== 'signed') throw new Error(t.send.notSigned);
			if (m.signed.id !== prepared!.request.id) throw new Error(t.send.otherRequest);
			signed = m.signed;
		} catch (e) {
			problem = (e as Error).message;
			return;
		}
		// a reply can name accounts the request used by number: now the web app knows them,
		// whatever the broadcast does
		addAccounts(signed.accounts);
		results = [];
		step = 'done';
		publish();
	}

	/** Broadcasts what is not sent yet: every transaction, then on "Broadcast again" the ones
	 * that failed. The same signed transaction sent twice is harmless. */
	async function publish() {
		if (!signed) return;
		const txs = signed.txs;
		const todo = txs.map((_, k) => k).filter((k) => !results[k]?.ok);
		problem = '';
		busy = true;
		try {
			const out = await broadcast(
				account.network,
				asset.chain,
				todo.map((k) => txs[k].raw)
			);
			const next = [...results];
			todo.forEach((k, j) => (next[k] = out[j]));
			results = next;
			clearTimeout(later);
			later = setTimeout(() => refresh([account]), 4000);
		} catch (e) {
			problem = t.send.notBroadcast((e as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

<div class="stack narrow">
	<div class="row">
		<button class="ghost" onclick={back}
			>← {move ? t.common.home : `${NETWORK_NAMES[account.network]} #${account.index}`}</button
		>
	</div>
	{#if move}
		<h2>
			{t.send.moveTitle(account.network === 'evm' ? asset.chain.name : '')}
			<span class="dim">{t.send.from(account.index)}</span>
		</h2>
	{:else}
		<h2>{t.send.sendTitle(asset.symbol, account.network === 'evm' ? asset.chain.name : '')}</h2>
	{/if}

	{#if step === 'form'}
		<div class="card stack">
			{#if move}
				<div class="stack tight">
					<span class="label">{t.send.whatMoves}</span>
					<p>{list(holdings.filter((a) => a.amount > 0n)) || t.send.nothingHere}</p>
					<span class="small"
						>{account.network === 'evm'
							? t.send.movesEvm(asset.chain.symbol)
							: t.send.movesBitcoin}</span
					>
				</div>
				<label class="stack tight">
					<span class="label">{t.send.to}</span>
					<span
						>{t.send.yourAccount}<input
							class="index"
							type="number"
							min="0"
							value={fresh ?? ''}
							oninput={(e) =>
								(typed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							aria-label={t.send.moveToLabel}
						/>{t.send.moveToAfter}</span
					>
				</label>
			{:else}
				<label class="stack tight">
					<span class="label">{t.send.to}</span>
					<input
						bind:value={to}
						placeholder={account.network === 'evm' ? '0x…' : t.send.address}
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<label class="stack tight">
					<span class="label">{t.send.amount}</span>
					<div class="row">
						<input
							class="grow"
							bind:value={amountText}
							placeholder="0.0"
							inputmode="decimal"
							disabled={max}
						/>
						<button class:primary={max} aria-pressed={max} onclick={() => (max = !max)}
							>{t.send.max}</button
						>
					</div>
					<span class="small"
						>{t.send.available(
							`${formatUnits(asset.amount, asset.decimals)} ${asset.symbol}`
						)}</span
					>
				</label>
			{/if}
			<div class="stack tight">
				<span class="label" id="fee-label">{t.send.fee}</span>
				<div class="row speeds" role="group" aria-labelledby="fee-label">
					{#each [t.send.slow, t.send.normal, t.send.fast] as s, i (i)}
						<button
							class:primary={speed === i}
							aria-pressed={speed === i}
							onclick={() => (speed = i as 0 | 1 | 2)}>{s}</button
						>
					{/each}
				</div>
			</div>
			{#if move}
				<!-- nothing to choose: everything moves -->
			{:else if account.network === 'bitcoin' && !bunker}
				<div class="stack tight">
					<span class="label">{t.send.change}</span>
					<p class="small">{t.send.changeBack}</p>
				</div>
			{:else if account.network === 'bitcoin'}
				<div class="stack tight">
					<span class="label">{t.send.change}</span>
					<p class="small">
						{t.send.changeBefore}<input
							class="index"
							type="number"
							min="0"
							value={fresh ?? ''}
							oninput={(e) =>
								(typed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							aria-label={t.send.changeLabel}
						/>{t.send.changeAfter}
					</p>
				</div>
			{:else}
				<fieldset class="stack tight">
					<legend class="label">{t.send.rest}</legend>
					<label class="choice" class:on={moveRest}>
						<input type="radio" name="rest" value={true} bind:group={moveRest} />
						<span class="grow">
							<b
								>{t.send.moveRest}<input
									class="index"
									type="number"
									min="0"
									value={fresh ?? ''}
									oninput={(e) =>
										(typed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
									aria-label={t.send.freshLabel}
								/></b
							>
							{#if bunker}<span class="pill safe">{t.send.recommended}</span>{/if}
							<span class="small">{t.send.moveRestNote(asset.chain.name)}</span>
						</span>
					</label>
					<label class="choice" class:on={!moveRest}>
						<input type="radio" name="rest" value={false} bind:group={moveRest} />
						<span class="grow">
							<b>{t.send.leave}</b>
							<span class="small">{t.send.leaveNote}</span>
						</span>
					</label>
				</fieldset>
			{/if}
			{#if bunker && others.length}<div class="notice warn small">
					{t.send.elsewhereBefore(atStake)}<b>{t.send.toMove}</b>{t.send.elsewhereAfter}
				</div>{/if}
			{#if bunker && exposure === 'exposed' && !move}<div class="notice warn small">
					{t.send.alreadyExposed}
				</div>{/if}
			{#if problem}<div class="notice danger" role="alert">{problem}</div>{/if}
			<button class="primary" onclick={review} disabled={busy}
				>{busy ? t.send.preparing : t.send.review}</button
			>
		</div>
	{:else if step === 'review' && prepared}
		<div class="card stack">
			<div class="label">{t.send.phoneWillSign}</div>
			<ol class="lines">
				{#each prepared.summary as line, i (i)}<li class="mono">{line}</li>{/each}
			</ol>
			<div class="row">
				<span class="dim fee-label">{t.send.feeAtMost}</span><b class="fee">{prepared.fee}</b>
			</div>
			{#if prepared.restFee}<div class="row small">
					<span class="dim fee-label">{t.send.restFee}</span><span class="fee"
						>{prepared.restFee}</span
					>
				</div>{/if}
			{#if prepared.left}<div class="notice info small">{prepared.left}</div>{/if}
			<div class="row">
				<button onclick={() => (step = 'form')}>{t.send.edit}</button>
				<button class="primary grow" onclick={() => (step = 'request')}>{t.send.show}</button>
			</div>
		</div>
	{:else if step === 'request' && prepared}
		<p class="dim">
			{t.send.requestBefore}<b>{t.send.scanRequest}</b>{t.send.requestAfter}
		</p>
		<CodeCanvas data={encode(prepared.request)} name="airkeys-sign.json" />
		<div class="row">
			<button onclick={() => (step = 'review')}>{t.send.back}</button>
			<button class="primary grow" onclick={() => (step = 'reply')}>{t.send.scanReply}</button>
		</div>
		<details class="small">
			<summary>{t.send.codeSays}</summary>
			<Json value={prepared.request} />
		</details>
	{:else if step === 'reply'}
		<p class="dim">{t.send.replyLead}</p>
		<CameraScan onmessage={replied} />
		{#if problem}<div class="notice danger" role="alert">{problem}</div>{/if}
		<div><button onclick={() => (step = 'request')}>{t.send.showAgain}</button></div>
	{:else if step === 'done'}
		<div class="card stack">
			{#if busy}
				<p role="status">{t.send.broadcasting}</p>
			{:else}
				{#each results as r, i (i)}
					{@const link = r.hash ? explorerLink(asset.chain.explorer.tx, r.hash) : null}
					<div class="row">
						<span class="pill {r.ok ? 'safe' : 'warn'}">{r.ok ? t.send.sent : t.send.refused}</span>
						{#if link}<a class="mono small grow hash" href={link} target="_blank" rel="noreferrer"
								>{r.hash}</a
							>{:else if r.hash}<span class="mono small grow hash">{r.hash}</span>{/if}
						{#if r.error}<span class="small grow">{r.error}</span>{/if}
					</div>
				{/each}
				{#if problem}<div class="notice danger" role="alert">{problem}</div>{/if}
				{#if problem || results.some((r) => !r.ok)}
					<button onclick={publish}>{t.send.broadcastAgain}</button>
				{/if}
				<button class="primary" onclick={back}>{t.send.done}</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.narrow {
		max-width: 620px;
	}
	.tight {
		gap: 6px;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.speeds button {
		flex: 1;
	}
	.choice {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
		border: 1px solid var(--stroke);
		border-radius: 12px;
		cursor: pointer;
	}
	.choice.on {
		border-color: var(--lamp);
		background: color-mix(in srgb, var(--lamp) 7%, var(--raised));
	}
	.choice input[type='radio'] {
		width: 18px;
		height: 18px;
		margin-top: 3px;
		accent-color: var(--lamp);
	}
	.choice .small {
		display: block;
		margin-top: 3px;
	}
	.choice .pill {
		margin-left: 6px;
		vertical-align: 2px;
	}
	.index {
		display: inline-block;
		width: 72px;
		padding: 2px 6px;
		margin: 0 2px;
	}
	.lines {
		margin: 0;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		word-break: break-all;
		font-size: 14px;
	}
	.hash {
		word-break: break-all;
	}
	/* the label on one line; a long exact fee wraps instead */
	.fee-label {
		white-space: nowrap;
	}
	.fee {
		margin-left: auto;
		text-align: right;
		overflow-wrap: anywhere;
	}
</style>
