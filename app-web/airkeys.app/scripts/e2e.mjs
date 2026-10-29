// The whole system end to end, without a physical camera: the built web app in headless
// Chrome, whose webcam is a video of the phone's screen (the real Rust core, driven by
// core/app/examples/phone.rs), against an anvil fork of Ethereum mainnet.
//
//   1. the phone shows its accounts → the web app scans them (fake webcam)
//   2. the web app prepares "send 100 USDC, move the rest to account #1" from live fork state
//   3. its code on screen is read back pixel-exact → the phone signs it → films the reply
//   4. the web app scans the reply and broadcasts → the fork executes it
//
//   bun run build && node scripts/e2e.mjs        (needs Chrome, anvil and cast, cargo)
//   PHONE=1 runs it in a phone-sized browser; SHOTS=dir saves screenshots
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const CORE = path.resolve(WEB, '../../core');
const PHRASE = 'test test test test test test test test test test test junk';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const STRANGER = '0x000000000000000000000000000000000000dEaD';
const ANVIL = 8548;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmp = mkdtempSync(path.join(tmpdir(), 'airkeys-e2e-'));
const cam = path.join(tmp, 'cam.y4m');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => {
	console.log(`${ok ? '  ok ' : 'FAIL '} ${what}`);
	if (!ok) failures++;
};

// ------------------------------------------------------------------ the phone, the chain
execFileSync(
	'cargo',
	[
		'build',
		'-q',
		'--release',
		'-p',
		'airkeys-app',
		'--example',
		'phone',
		'--example',
		'read_screens'
	],
	{ cwd: CORE, stdio: 'inherit' }
);
const phone = (...args) =>
	execFileSync(path.join(CORE, 'target/release/examples/phone'), args, {
		env: { ...process.env, AIRKEYS_PHRASE: PHRASE }
	})
		.toString()
		.trim();
const accounts = JSON.parse(phone('accounts', cam)).accounts;
const evm0 = accounts.find((a) => a.network === 'evm').address;

const children = [];
process.on('exit', () => children.forEach((c) => c.kill()));
const anvil = spawn(
	'anvil',
	[
		'--fork-url',
		process.env.EVM_FORK_URL ?? 'https://ethereum-rpc.publicnode.com',
		'--port',
		String(ANVIL),
		'--chain-id',
		'1'
	],
	{ stdio: 'ignore' }
);
children.push(anvil);
const rpc = async (method, params = []) => {
	const r = await (
		await fetch(`http://127.0.0.1:${ANVIL}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
		})
	).json();
	if (r.error) throw new Error(JSON.stringify(r.error));
	return r.result;
};
for (let i = 0; ; i++) {
	try {
		await rpc('eth_chainId');
		break;
	} catch {
		if (i > 100) throw new Error('anvil did not start');
		await sleep(300);
	}
}
// A fork fetches each piece of mainnet state it reads, one after another within a request: the
// web app's reads of every listed token for 100 accounts would take minutes, and hold up the
// broadcasts. Read them first, many at a time, so the fork has them.
{
	const tokens = JSON.parse(readFileSync(path.join(WEB, '../../registry/networks.json'), 'utf8'))
		.evm.find((c) => c.chainId === 1)
		.tokens.map((t) => t.address);
	const pad = (a) => a.slice(2).toLowerCase().padStart(64, '0');
	const reads = accounts
		.filter((a) => a.network === 'evm')
		.flatMap(({ address: a }) => [
			['eth_getBalance', [a, 'latest']],
			['eth_getTransactionCount', [a, 'latest']],
			...tokens.map((t) => ['eth_call', [{ to: t, data: '0x70a08231' + pad(a) }, 'latest']])
		]);
	let next = 0;
	const started = Date.now();
	await Promise.all(
		Array.from({ length: 64 }, async () => {
			while (next < reads.length) await rpc(...reads[next++]).catch(() => {});
		})
	);
	console.log(
		`fork warmed: ${reads.length} reads in ${Math.round((Date.now() - started) / 1000)} s`
	);
}
await rpc('anvil_setBalance', [evm0, '0x' + (10n ** 19n).toString(16)]);
const slot = execFileSync('cast', ['index', 'address', evm0, '9']).toString().trim();
await rpc('anvil_setStorageAt', [USDC, slot, '0x' + 1_000_000_000n.toString(16).padStart(64, '0')]);
const usdcOf = async (who) =>
	BigInt(
		await rpc('eth_call', [
			{ to: USDC, data: '0x70a08231' + who.slice(2).toLowerCase().padStart(64, '0') },
			'latest'
		])
	);

// ------------------------------------------------------------------ the web app
const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.json': 'application/json'
};
const server = createServer((req, res) => {
	let p = path.join(
		WEB,
		'.svelte-kit/cloudflare',
		decodeURIComponent(new URL(req.url, 'http://x').pathname)
	);
	try {
		if (statSync(p).isDirectory()) p = path.join(p, 'index.html');
		res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
		res.end(readFileSync(p));
	} catch {
		res.writeHead(404).end();
	}
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------------ Chrome over CDP
const profile = mkdtempSync(path.join(tmpdir(), 'airkeys-chrome-'));
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--use-fake-ui-for-media-stream',
		'--use-fake-device-for-media-stream',
		`--use-file-for-fake-video-capture=${cam}`,
		'--window-size=1280,1000',
		'about:blank'
	],
	{ stdio: 'ignore' }
);
children.push(chrome);
let page;
for (let i = 0; !page && i < 600; i++) {
	await sleep(100);
	try {
		const port = Number(
			readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]
		);
		page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
			(p) => p.type === 'page'
		);
	} catch {
		/* not up yet */
	}
}
if (!page) throw new Error('Chrome did not start');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
// Chrome gone (a crash): fail now, not wait forever on its answers
ws.onclose = () => {
	console.log('FAIL  Chrome closed the connection');
	process.exit(1);
};
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id && waiting.has(msg.id)) (waiting.get(msg.id)(msg.result), waiting.delete(msg.id));
	if (msg.method === 'Runtime.exceptionThrown')
		console.log('page error:', msg.params.exceptionDetails.exception?.description);
};
const send = (method, params = {}) =>
	new Promise((r) => (waiting.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
// PHONE=1: the whole flow in a phone's browser (390×844 at 3×), where the code fills the screen
if (process.env.PHONE)
	await send('Emulation.setDeviceMetricsOverride', {
		width: 390,
		height: 844,
		deviceScaleFactor: 3,
		mobile: true
	});
const js = async (expr) =>
	(await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))
		.result?.value;
const text = () => js('document.body.innerText');
const until = async (what, test, ms = 30000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await test()) return true;
		await sleep(250);
	}
	console.log(await text());
	throw new Error(`timed out: ${what}`);
};
// screenshots of each step, when SHOTS names a directory
const shot = async (name) => {
	if (!process.env.SHOTS) return;
	// the whole page; in a phone's browser the screen (a long page at 3× crashes Chrome)
	const { data } = await send('Page.captureScreenshot', {
		format: 'png',
		captureBeyondViewport: !process.env.PHONE
	});
	writeFileSync(path.join(process.env.SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
};
const click = (label) =>
	js(
		`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === ${JSON.stringify(label)}); b?.click(); return !!b })()`
	);
const type = (selector, value) =>
	js(
		`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
	);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `${origin}/` });
await sleep(800);
await shot('w0-landing');
await js(
	`localStorage.setItem('airkeys.v1', JSON.stringify({ accounts: [], settings: { rpc: { 'evm:1': 'http://127.0.0.1:${ANVIL}' }, explorer: {}, chains: [] } }))`
);
await send('Page.navigate', { url: `${origin}/app/` });
await until('the app', async () => (await text())?.includes('Connect your Airkeys phone'));
check(true, 'the web app opens with no accounts');
await shot('w1-empty');

try {
	// 1 · connect: the fake webcam shows the phone's accounts code
	await click('Scan phone');
	await until('accounts scanned', async () => /Bunker/.test(await text()));
	check(true, "the web app read the accounts from the phone's code through the camera");
	const stored = JSON.parse(await js(`localStorage.getItem('airkeys.v1')`));
	check(
		JSON.stringify(stored.accounts) === JSON.stringify(accounts),
		'it stored exactly the addresses the phone showed'
	);
	await sleep(4000);
	await shot('w2-accounts');

	// 2 · send 100 USDC from the EVM account, the rest moving to account #1
	await js(
		`document.querySelector('details.accounts').open = true; [...document.querySelectorAll('button.account')].find((b) => b.innerText.includes('Ethereum & EVM')).click()`
	);
	await until('balances', async () => (await text()).includes('1,000 USDC'), 60000);
	check(true, 'balances come from the fork: 1,000 USDC and 10 ETH');
	await shot('w3-account');
	await js(
		`[...document.querySelectorAll('.asset')].find((a) => a.innerText.includes('USDC') && a.innerText.includes('1,000')).querySelector('button').click()`
	);
	await until('send form', async () => (await text()).includes('Send USDC'));
	await type('input[placeholder="0x…"]', STRANGER);
	await type('input[inputmode="decimal"]', '100');
	await shot('w4-send');
	await click('Review');
	await until('review', async () => /the phone will sign/i.test(await text()), 60000);
	const review = await text();
	check(
		/Send 100 USDC/.test(review) &&
			/Move 900 USDC to your account #1/.test(review) &&
			/to your account #1/.test(review),
		'the review lists the payment and the moves to account #1'
	);
	await shot('w5-review');
	await click('Show to the phone');
	await until('request code', async () => js(`!!document.querySelector('canvas')?.width`));
	await sleep(300);
	await shot('w6-request');
	const geometry = await js(`(() => {
		const r = (e) => e.getBoundingClientRect();
		const c = document.querySelector('canvas');
		const [b, k] = [r(c.parentElement), r(c)];
		return \`window \${innerWidth}×\${innerHeight}: the code \${Math.round(k.width)}×\${Math.round(k.height)} px at \${Math.round(k.left - b.left)},\${Math.round(k.top - b.top)} in a box \${Math.round(b.width)}×\${Math.round(b.height)} at \${Math.round(b.left)}\`;
	})()`);
	console.log(`  ..  ${geometry}`);
	await js(
		`(() => { const d = document.querySelector('details'); d.open = true; d.scrollIntoView(); return true })()`
	);
	await sleep(200);
	await shot('w6-message');
	check(
		(await js(`document.querySelectorAll('pre.json .key').length`)) > 0,
		'what the code says is shown as coloured JSON'
	);

	// 3 · read the request off the screen exactly as drawn, let the phone sign it
	const shots = [];
	for (let n = 0; n < 6; n++) {
		const url = await js(`document.querySelector('canvas').toDataURL('image/png')`);
		const file = path.join(tmp, `request-${n}.png`);
		writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
		shots.push(file);
		await sleep(120);
	}
	const requestJson = execFileSync(path.join(CORE, 'target/release/examples/read_screens'), shots)
		.toString()
		.trim();
	const request = JSON.parse(requestJson);
	check(
		request.type === 'sign' &&
			request.network === 'evm' &&
			request.chainId === 1 &&
			request.txs.length === 3,
		`the code on screen is the sign request (${request.txs.length} transactions)`
	);
	writeFileSync(path.join(tmp, 'request.json'), requestJson);
	const signed = JSON.parse(
		phone('sign', path.join(tmp, 'request.json'), path.join(tmp, 'signed.y4m'))
	);
	check(signed.type === 'signed' && signed.id === request.id, 'the phone signed it');
	copyFileSync(path.join(tmp, 'signed.y4m'), cam);

	// 4 · the web app scans the reply and broadcasts to the fork
	const before = await usdcOf(STRANGER);
	await click("Scan the phone's reply");
	await until(
		'broadcast',
		async () => (await text()).includes('Done') && /Sent|Refused/.test(await text()),
		60000
	);
	const done = await text();
	await shot('w7-done');
	check(
		(done.match(/Sent/g) ?? []).length === 3 && !done.includes('Refused'),
		'all three transactions were broadcast'
	);
	for (const tx of signed.txs) {
		let receipt = null;
		for (let i = 0; i < 50 && !receipt; i++)
			((receipt = await rpc('eth_getTransactionReceipt', [tx.hash])), await sleep(100));
		if (receipt?.status !== '0x1') {
			const t = await rpc('eth_getTransactionByHash', [tx.hash]);
			console.log(
				'      receipt',
				JSON.stringify({
					status: receipt?.status,
					gasUsed: receipt?.gasUsed,
					gas: t?.gas,
					to: t?.to
				})
			);
			const trace = await rpc('debug_traceTransaction', [tx.hash, {}]).catch((e) => ({
				error: e.message
			}));
			console.log(
				'      trace',
				JSON.stringify({
					failed: trace.failed,
					gas: trace.gas,
					ret: trace.returnValue,
					err: trace.error
				}).slice(0, 300)
			);
		}
		check(receipt?.status === '0x1', `tx ${tx.hash.slice(0, 10)}… executed on the fork`);
	}
	check((await usdcOf(STRANGER)) - before === 100_000_000n, 'the stranger received 100 USDC');
	const a1 = signed.accounts[0].address;
	check((await usdcOf(a1)) === 900_000_000n, 'account #1 received the other 900 USDC');
	check(
		BigInt(await rpc('eth_getBalance', [a1, 'latest'])) > 9n * 10n ** 18n,
		'account #1 received the ETH'
	);
	const after = JSON.parse(await js(`localStorage.getItem('airkeys.v1')`));
	check(
		after.accounts.some((a) => a.network === 'evm' && a.index === 1 && a.address === a1),
		'the web app now knows account #1 from the reply'
	);
	// the asset panel once every balance is read (a screenshot for the site, when SHOTS is set)
	if (process.env.SHOTS) {
		await click('Home');
		await until('balances read', async () => !/Reading, \d+ to go/.test(await text()), 120000);
		await sleep(1500);
		await shot('w8-home');
	}
} catch (e) {
	failures++;
	console.log('FAIL ', e.message);
} finally {
	ws.onclose = null;
	chrome.kill();
	anvil.kill();
	server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
