// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** The web app's view, by its place in this tab's history (lib/app/App.svelte). */
			view?: number;
		}
		// interface Platform {}
	}
}

export {};
