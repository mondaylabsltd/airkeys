<script lang="ts">
	// Plays a message as Lumen Code: an animated grid the phone's camera reads, as large as the
	// screen allows. On a computer it is a square (what a phone held upright frames best); in a
	// phone's browser it fills the screen, taller than wide, and so carries more in each frame.
	// Its cells are the largest with which the phone reads the message within two frames — a
	// phone's camera, close to a screen, reads smaller cells than a webcam does; a large message
	// keeps the smallest of them and takes more frames. Cells are a whole number of device
	// pixels, never smoothed.
	import {
		Receiver,
		Sender,
		preparePayload,
		type PreparedPayload
	} from 'lumen-code/src/core/transfer.js';
	import { Renderer } from 'lumen-code/src/core/render.js';
	import { onDestroy } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	let { data, name, fps = 10 }: { data: Uint8Array; name: string; fps?: number } = $props();
	// cells across the short side, largest cells first; 4 colours, 22 % parity, as the phone
	const SHORT_SIDES = [52, 60, 72, 84];
	const READ_FRAMES = 2;
	const MAX_ASPECT = 2.4; // Lumen's limit, long side to short
	const QUIET = 2; // cells of quiet zone a side
	const NARROW = 560; // a phone's browser: the code fills the screen
	const PAD = 12;
	const MAX_WIDTH = 820;
	const BUTTONS = 76; // the row of buttons under the code, with its gap
	const MIN_SIDE = 300; // smaller, a camera across a desk reads it poorly
	let canvas: HTMLCanvasElement;
	let box: HTMLDivElement;
	let timer: ReturnType<typeof setInterval> | undefined;
	let runs = 0;
	let narrow = $state(false);
	let tall = $state(0);

	/** Frames until a reader that catches every one has the message: the sender's own
	 * schedule played into a receiver. */
	async function framesToRead(prepared: PreparedPayload, X: number, Y: number): Promise<number> {
		let tx: Sender;
		try {
			tx = new Sender(prepared, { mode: 1, ecc: 2, X, Y, tid: 1 });
		} catch {
			return Infinity;
		}
		const rx = new Receiver();
		for (let n = 1; n <= READ_FRAMES; n++) {
			for (const p of tx.nextPackets()) await rx.push(p);
			if (await rx.tryFinish()) return n;
		}
		return Infinity;
	}

	/** The grid (cells across, down) for an area: its shape, quiet zone included, and the
	 * largest cells that read fast. The phone chooses the same way, for a webcam. */
	async function grid(prepared: PreparedPayload, w: number, h: number): Promise<[number, number]> {
		const aspect = Math.min(Math.max(w, h) / Math.min(w, h), MAX_ASPECT);
		const shape = (side: number): [number, number] => {
			const along = Math.floor((side + 2 * QUIET) * aspect) - 2 * QUIET;
			const long = Math.min(Math.max(along, side), Math.floor(side * MAX_ASPECT));
			return w > h ? [long, side] : [side, long];
		};
		for (const side of SHORT_SIDES) {
			const [x, y] = shape(side);
			if ((await framesToRead(prepared, x, y)) <= READ_FRAMES) return [x, y];
		}
		return shape(SHORT_SIDES[SHORT_SIDES.length - 1]);
	}

	async function start(bytes: Uint8Array, file: string) {
		const run = ++runs;
		clearInterval(timer);
		narrow = window.innerWidth <= NARROW;
		// the area, in CSS pixels: on a phone the screen's width, and its height below the
		// page's sticky header with room for the buttons; on a computer a square that fits the
		// window under the header, with the buttons in view too
		const screen = document.documentElement.clientWidth;
		const width = narrow ? screen : Math.min(screen - 32, MAX_WIDTH) - 2 * PAD;
		const [w, h] = narrow
			? [width, Math.max(width, window.innerHeight - covered() - BUTTONS)]
			: Array(2).fill(
					Math.max(MIN_SIDE, Math.min(width, window.innerHeight - covered() - BUTTONS - 2 * PAD))
				);
		tall = narrow ? h : 0;
		const prepared = await preparePayload(bytes, file);
		const [X, Y] = await grid(prepared, w, h);
		if (run !== runs) return;
		const tid = crypto.getRandomValues(new Uint16Array(1))[0];
		const tx = new Sender(prepared, { mode: 1, ecc: 2, X, Y, tid });
		const dpr = window.devicePixelRatio || 1;
		const s = Math.max(
			2,
			Math.floor(Math.min((w * dpr) / (X + 2 * QUIET), (h * dpr) / (Y + 2 * QUIET)))
		);
		const ctx = canvas.getContext('2d')!;
		let r: Renderer | undefined, img: ImageData;
		const draw = () => {
			const { cells: frame, layout } = tx.nextFrame();
			if (!r) {
				r = new Renderer(layout, 1, s, QUIET);
				canvas.width = r.width;
				canvas.height = r.height;
				canvas.style.width = `${r.width / dpr}px`;
				canvas.style.height = `${r.height / dpr}px`;
				img = ctx.createImageData(r.width, r.height);
			}
			r.draw(frame, new Uint32Array(img.data.buffer));
			ctx.putImageData(img, 0, 0);
		};
		draw();
		timer = setInterval(draw, 1000 / fps);
		// all of it in view under the header, the buttons just below: on a phone the code is the
		// screen; on a computer it moves up only when it does not fit where it is
		const top = box.getBoundingClientRect().top;
		if (narrow || top < covered() || top + h + 2 * PAD + BUTTONS > window.innerHeight)
			window.scrollTo({
				top: top + window.scrollY - covered() - (narrow ? 0 : PAD),
				behavior: narrow ? 'instant' : 'smooth'
			});
	}

	/** How much of the window's top the page's sticky bars cover. */
	function covered(): number {
		const bars = [...document.querySelectorAll<HTMLElement>('header, .testnet')];
		return Math.max(
			0,
			...bars.map((e) => {
				const css = getComputedStyle(e);
				return css.position === 'sticky' ? (parseFloat(css.top) || 0) + e.offsetHeight : 0;
			})
		);
	}

	$effect(() => {
		start(data, name);
	});

	// a new shape when the width changes (turning the phone, resizing the window) — not when a
	// phone's browser shows or hides its address bar, which would restart the transfer
	let lastWidth = 0;
	let resizing: ReturnType<typeof setTimeout> | undefined;
	function resized() {
		if (window.innerWidth === lastWidth) return;
		lastWidth = window.innerWidth;
		clearTimeout(resizing);
		resizing = setTimeout(() => start(data, name), 300);
	}
	$effect(() => {
		lastWidth = window.innerWidth;
	});
	onDestroy(() => {
		runs++;
		clearInterval(timer);
		clearTimeout(resizing);
	});
</script>

<svelte:window onresize={resized} />

<div class="code" class:narrow bind:this={box} style:height={tall ? `${tall}px` : null}>
	<canvas bind:this={canvas} aria-label={t.ui.codeLabel}></canvas>
</div>

<style>
	/* wider than the page's column when the screen allows (up to 820px), centred on it — and
	   the whole screen on a phone. Dark around the code: its own quiet zone, Lumen's ink. */
	.code {
		position: relative;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		place-items: center;
		width: max-content;
		padding: 12px;
		border-radius: 20px;
		background: #0a0d14;
	}
	.code.narrow {
		width: 100vw;
		padding: 0;
		border-radius: 0;
	}
	canvas {
		image-rendering: pixelated;
		display: block;
		max-width: 100%;
	}
</style>
