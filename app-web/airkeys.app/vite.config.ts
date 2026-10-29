import { defineConfig } from 'vitest/config';
import cloudflare from '@sveltejs/adapter-cloudflare';
import files from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// AIRKEYS_EXTENSION=1 builds the browser extension (scripts/extension.mjs): the app alone,
// hash-routed into one page, because an extension serves files, not routes
const extension = process.env.AIRKEYS_EXTENSION === '1';

export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit({
			compilerOptions: { runes: true },
			// the site: a Cloudflare Worker (wrangler.jsonc) whose pages are all prerendered and
			// served as files, and 404.html (the error page) for any other path; the extension:
			// plain files
			adapter: extension
				? files({ pages: 'extension', assets: 'extension', fallback: 'index.html' })
				: cloudflare({ fallback: 'spa' }),
			// browser extensions refuse folder names that start with "_"
			appDir: 'app-kit',
			...(extension
				? { files: { routes: 'src/extension' }, router: { type: 'hash' as const } }
				: {}),
			// prerendered pages carry it as a <meta>, with the hash of SvelteKit's inline script.
			// Scripts and the scanning worker come from the site itself; chain endpoints are
			// settings: any HTTPS server, or a node on this computer. The extension's policy is
			// its manifest's (scripts/extension.mjs), and its inline script moves to a file.
			csp: extension
				? undefined
				: {
						mode: 'hash',
						directives: {
							'default-src': ['none'],
							// the site pages' visit counter (src/lib/site/Analytics.svelte)
							'script-src': ['self', 'https://tj.appsdata.org/api/script.js'],
							'worker-src': ['self'],
							'style-src': ['self', 'unsafe-inline'],
							// token and network logos (src/lib/ui/Coin.svelte)
							'img-src': ['self', 'data:', 'blob:', 'https://ethereum-data.getvela.app'],
							'connect-src': [
								'https:',
								'http://localhost:*',
								'http://127.0.0.1:*',
								// the dev server's own websocket (hot reload)
								...(command === 'serve' ? (['self'] as const) : [])
							],
							'manifest-src': ['self'],
							'object-src': ['none'],
							'base-uri': ['none'],
							'form-action': ['none']
						}
					}
		})
	],
	// registry/networks.json is shared with the phone's core, at the repository root
	server: { fs: { allow: ['../../registry'] } },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
}));
