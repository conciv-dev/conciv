# core/src/lib

## Overview

Server helpers for the core engine: loopback-only Host/Origin CORS middleware, the dev-endpoint discovery file in ~/.conciv, a probe that reports when loaded engine modules change on disk, the persisted server port, and the state file layout.

## Interface

- `corsMiddleware` / `originAllowed` / `widgetCaller` / `loopbackHostAllowlist` / `CorsVars` (`cors.ts`)
- `logError` (`debug.ts`): writes a line to stderr
- `DevEndpointSchema` / `DevEndpoint` (`dev-endpoint.ts`): {apiBase, token: string|null, pid}
- `defaultDevEndpointDir` / `writePrivateFile` / `writeDevEndpoint` / `readDevEndpoint` / `removeDevEndpoint` (`dev-endpoint.ts`): `<dir>/dev-endpoint.json`, default dir ~/.conciv
- `makeStalenessProbe` / `loadedModules` / `engineStaleness` / `TrackedModule` (`engine-stamp.ts`): {stale, changed, tracked, bootedAt, fingerprint}
- `writeText` (`fs.ts`): mkdir -p then write
- `readPersistedPort` / `writePersistedPort` / `isAddressInUse` (`server-port.ts`)
- `statePaths` / `StatePaths` (`state-paths.ts`): {dir, systemPrompt: chat-system-prompt.txt, server: server.json} under `concivStateDir(stateRoot)`

## Invariants

- `corsMiddleware` (`cors.ts`): a Host that is not a bare loopback authority gets 403 'forbidden host'; an Origin that is not loopback or in `allowedOrigins` gets 403 'forbidden origin'; no Origin is allowed
- `writeDevEndpoint` (`dev-endpoint.ts`): validates with `DevEndpointSchema.parse`
- `readDevEndpoint` (`dev-endpoint.ts`): null on a missing file, bad JSON or schema failure
- `removeDevEndpoint` (`dev-endpoint.ts`): deletes only when the file is absent or invalid or its pid matches the caller
- `writePrivateFile` (`dev-endpoint.ts`): mode 0600, temp file plus rename; removes the temp file on failure
- `readPersistedPort` (`server-port.ts`): an integer 1-65535 or undefined
- `makeStalenessProbe` (`engine-stamp.ts`): the fingerprint is the first 12 hex chars of sha256 over current digests

## Side Effects

- `logError` (`debug.ts`): writes to process.stderr
- `writeDevEndpoint` / `removeDevEndpoint` (`dev-endpoint.ts`): write or delete files under ~/.conciv by default
- `engine-stamp.ts`: on load resolves modules with `import.meta.resolve` and hashes them; each `engineStaleness` call re-reads them
- `writeText` (`fs.ts`), `writePersistedPort` (`server-port.ts`): write files

## Verification

- Run: `cd packages/core && pnpm test`
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
