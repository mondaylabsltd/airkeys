<script lang="ts">
	// A coin or token's mark: the network's own logo for Bitcoin and ETH; otherwise the logo
	// ethereum-data.getvela.app has for it (a token's by its address, a coin's by its chain),
	// and where it has none, the symbol on a colour of its own (the same symbol, the same
	// colour). A logo request names a token, never an address of the wallet.
	import type { Asset } from '#lib/chains/index.ts';
	import { chainLogo, tokenLogo } from '#lib/chainData.ts';
	import Badge from './Badge.svelte';

	let { asset, size = 36 }: { asset: Asset; size?: number } = $props();
	const network = $derived(
		asset.chain.chainId === undefined
			? 'bitcoin'
			: asset.token
				? null
				: asset.symbol === 'ETH'
					? 'evm'
					: null
	);
	const logo = $derived(
		network || asset.chain.chainId === undefined
			? null
			: asset.token
				? tokenLogo(asset.chain.chainId, asset.token.address)
				: chainLogo(asset.chain.chainId)
	);
	// the symbol shows until the logo has loaded, and stays where there is none (or offline)
	let loaded = $state<string | null>(null);
	const hue = $derived([...asset.symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 17));
	const text = $derived(asset.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 4));
</script>

{#if network}
	<Badge {network} {size} />
{:else}
	<span
		class="coin"
		style:width="{size}px"
		style:height="{size}px"
		style:font-size="{Math.round(size * (text.length > 3 ? 0.27 : 0.33))}px"
		style:--hue={hue}
		aria-hidden="true"
		>{text}{#if logo}<img
				src={logo}
				alt=""
				width={size}
				height={size}
				loading="lazy"
				referrerpolicy="no-referrer"
				class:shown={loaded === logo}
				onload={() => (loaded = logo)}
			/>{/if}</span
	>
{/if}

<style>
	.coin {
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		overflow: hidden;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: hsl(var(--hue) 70% 82%);
		background: hsl(var(--hue) 45% 22%);
		border: 1px solid hsl(var(--hue) 40% 32%);
		position: relative;
	}
	/* a logo over the symbol: the symbol hides, as a logo may be transparent */
	.coin:has(img.shown) {
		color: transparent;
		background: var(--raised);
		border-color: var(--stroke);
	}
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
	}
	img.shown {
		opacity: 1;
	}
</style>
