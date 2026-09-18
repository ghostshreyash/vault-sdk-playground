# Vault SDK Playground

Postman for the Vault SDK. Pick any SDK method, give it any arguments, send, and see exactly
what comes back.

```bash
npm install
npm run dev   # http://localhost:5190
```

## Using it

1. **Environment** (top bar → Edit): base URL, optional WS URL, the three keys, the SDK
   source (`vault-sdk-dev`, `vault-sdk-staging`, `vault-sdk-prod`, or the local
   `SDK/vault-client-sdk` checkout), and variables such as `vaultId` and `botId`.
2. **Methods** (left): every method on the `Vault` class, grouped as in the SDK source, with
   its JSDoc under the **Docs** tab. `internal` and `sync` methods are marked, not hidden.
   When the local SDK checkout is available, `setBotLlm`, `testBotLlm`, `setBotLlmEnabled`,
   `clearBotLlm`, and `getLlmProviders` are grouped under **Bot LLM** and work through the
   same argument editor, request execution, traffic capture, responses, saved requests, and
   history as `createBot` and `updateBot`.
3. **Arguments**: each argument can be sent as String, Number, Boolean, JSON, File, File[],
   JS expression, `null` or `undefined`, whatever the docs say. Use `{{vaultId}}` for
   variables. **Add extra argument** passes more arguments than the signature declares.
4. **Send** (Ctrl+Enter). The bottom panel shows:
   - the returned value or the thrown error (`code`, `status`, server `data`, stack)
   - **Traffic**: every HTTP request (signed headers, body, response) and socket frame the
     call produced
   - the arguments exactly as passed
5. **Save … into variable** copies a value from the result (e.g. `data.vaultId`) into the
   environment for later calls.
6. **Script**: free-form async JS with `vault`, `vars` and `last` in scope, for chains and
   for tampering with the instance (for example a wrong `apiSecret` to test 401s).

**Theme**: the sun/moon button in the top bar switches between Light, Dark and System
(follows the OS). Your choice is remembered and applied before the first paint, so there is
no flash on reload.

Also available: **Saved** requests, **History**, a **Live traffic** dock for socket messages
that arrive after a call returns, **Code** export of any call as a Node snippet, **Reset**
(closes sockets and discards the instance), and workspace export/import (with or without
keys).

Keys are stored in this browser's `localStorage`. Use test credentials only.

## Deploying

The app is a static Vite build (`npm run build` → `dist/`), so Vercel needs no extra config.
Two things to know before putting it on a public URL:

- **Restrict who can open it.** Script mode and JS arguments run whatever is typed, by
  design, and testers paste real API keys into it. Turn on Vercel Deployment Protection (or
  put it behind SSO) rather than leaving the URL open.
- **The "Local source" option is hidden on a deployment**, because the sibling
  `SDK/vault-client-sdk` checkout is not in this repo. The three published packages work
  normally. Run it locally inside the TSP workspace to test unpublished SDK code.

Also make sure the Vault gateway allows the deployment's origin via CORS, otherwise every
call fails in the browser while working fine locally.
