<script lang="ts">
	import type { Exposure } from '#lib/chains/index.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { bunkerOn } from '#lib/state.svelte.ts';
	let { exposure, loading = false }: { exposure: Exposure; loading?: boolean } = $props();
</script>

<!-- a plain cold wallet (bunker mode off) does not keep count of exposed keys -->
{#if !bunkerOn()}{:else if exposure === 'hidden'}
	<span class="pill safe" title={t.exposure.hiddenTitle}>
		<svg viewBox="0 0 24 24"
			><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg
		>{t.exposure.hidden}
	</span>
{:else if exposure === 'exposed'}
	<span class="pill warn" title={t.exposure.exposedTitle}>
		<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>{t
			.exposure.exposed}
	</span>
{:else if loading}
	<span class="pill dim">{t.exposure.checking}</span>
{:else}
	<span class="pill dim" title={t.exposure.unknownTitle}>{t.exposure.unknown}</span>
{/if}

<style>
	svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
