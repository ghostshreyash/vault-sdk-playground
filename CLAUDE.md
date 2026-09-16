# vault-sdk-playground — unrestricted tester for the Vault SDK

A Vite + React + TS app, Postman-style, where the "requests" are Vault SDK method calls.
Unlike `SDK/VAULT-SDK-Testing`, it has no flows or guard rails: testers pick any method on the
`Vault` class (internal ones included) and pass any value for any argument.

Not a git repo yet and not deployed. Runs locally on port 5190.

## Commands

| | |
|---|---|
| `npm run dev` | vite on :5190 |
| `npm run build` | `tsc -b && vite build` — type-checks |
| `npm run lint` | eslint |

## How it works

- **No hand-written method list.** `src/sdk/catalog.ts` parses the SDK's own `src/Vault.js`
  (imported with `?raw`) for methods, parameters, JSDoc and `// ─── Section ───` groups, and
  cross-checks the class prototype. A new SDK method appears without touching this app.
  Keep that JSDoc format in `vault-client-sdk` or argument prefill degrades to plain strings.
- **Four SDK sources**, chosen per environment (`src/sdk/sources.ts`): `vault-sdk-dev`,
  `vault-sdk-staging` and `vault-sdk-prod` from npm, plus the sibling checkout
  `../vault-client-sdk` via the `vault-sdk-local/` alias. Adding another published channel
  means one entry there and one dependency — nothing else.
- **The local source disappears outside the workspace.** `vite.config.ts` checks for
  `../vault-client-sdk/src/Vault.js`; when it is missing (a standalone clone, Vercel, CI) the
  alias points at `src/stub-sdk/` and `__HAS_LOCAL_SDK__` is false, so `SDK_SOURCES` hides
  that option and the build still succeeds. Set `PLAYGROUND_NO_LOCAL_SDK=1` to reproduce a
  deployment build locally.
- **The SDK is Node-shaped.** `vite.config.ts` aliases `crypto`, `events`, `stream`, `fs`
  and `ws` to browser shims, and pins `axios` to its browser ESM build so the app and every
  SDK source share one axios module.
- **Traffic capture.** `src/sdk/runtime.ts` adds interceptors to the instance's `httpClient`
  and to the default axios export (storage PUTs use it). `src/shims/ws.ts` subclasses
  `WebSocket` to log every frame. `emit` is wrapped to log SDK events.
- **One live instance** (`getVault`), rebuilt whenever the SDK source or environment config
  changes, so sockets survive across calls.
- **Theme.** `src/lib/theme.tsx` is a small local provider (light/dark/system) that toggles
  `.dark` on `<html>`; the palette lives in `src/index.css` as tokens under `:root` and
  `.dark`. An inline script in `index.html` applies the stored choice before first paint —
  keep both in sync if the storage key changes. Deliberately not `next-themes`: it renders a
  script tag that React warns about outside Next.js.
- **JS expressions and the Script entry use `new Function`.** This is a local tool for our own
  testers. Never deploy it publicly with that in place.

## State

`src/store/workspace.ts` persists environments (including keys), drafts, saved requests and
history to `localStorage` under `vault-sdk-playground`. Picked `File`s are never persisted.
