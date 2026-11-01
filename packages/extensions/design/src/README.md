# design/src

## Overview

`client.ts` calls `defineExtension` with name `design` and the `designConfig` schema, and registers `CLIENT_TOOLS` (imported from ./tool/client.js). `server.ts` does the same with `SERVER_STEPS` (from ./tool/server.js). Its server factory builds a `DesignRuntime` from `pickRuntime` (./server/registries.js), a target store under `<stateDir>/design` (./server/store.js), a cached CSS map (./server/provenance/css-map.js) and an xray URL builder; it returns the oRPC router and Hono app from ./server/xray-routes.js. The subdirectories hold the browser capture and cascade code (client/), the server runtime (server/), the tool wiring (tool/), the x-ray viewer page (xray/) and the shared schemas and types (shared/).

## Interface

- `design` / default export (`client.ts`): client extension `design` with `configSchema: designConfig`, `tools: CLIENT_TOOLS`, client value `{}`
- module augmentation of `ExtensionRegistry` in `@conciv/protocol/config-types` (`client.ts`): registers `typeof design` for typed config
- `design` / default export (`server.ts`): server extension `design` with `tools: SERVER_STEPS`; returns `context: {design: DesignRuntime}`, `router` (from `makeXrayRouter`), `app` (from `makeXrayApp` with `pageDir` = `xray/` next to the built module) and `dispose`
- `xrayUrl` (`server.ts`): builds the token-free path `/api/ext/design/xray/list?target=<id>&session=<session>`; the widget prefixes it with its own API base
- Subdirectories:
  - [server](./server/README.md): Server-side core of the design extension: an on-disk target store, PNG raster utilities, x-ray HTTP/oRPC routes, the delta-kind list, the registry wiring, breakpoint tagging and detection of unmatched regions.
  - [shared](./shared/README.md): Code shared by the client and server: zod schemas and tool definitions for the six `design_*` tools, the extension config schema, the error catalog, tolerance constants, iframe message names, CSS property alias helpers, and the TypeScript types for the runtime, store, comparators and provenance.
  - [client](./client/README.md): Browser-side code for the design extension: viewport or off-screen iframe capture with snapdom, collection of the `data-conciv-source` component tree, and a CSS cascade resolver that names the winning declaration for each property.
  - [xray](./xray/README.md): SolidJS single-page viewer (the 'design x-ray') that loads a design target with its last diff report from the engine and shows the live, design and diff images next to a list of the components that differ.
  - [tool](./tool/README.md): Puts the design tool definitions together with their step implementations, giving one list of client tools and one list of server tools.

## Invariants

- `cssFiles` (`server.ts`): only collects `*.css` files under `<cwd>/src` that are not inside `node_modules`; a failed `readdir` becomes an empty list
- `lazyCssMap` (`server.ts`): caches the CSS map only when the bundler supports `subscribe`, and resets the cache on a `hmr-update` diagnostic for a `.css` file; without a bundler subscription the map is rebuilt on every call
- `xrayUrl` (`server.ts`): URI-encodes both the `target` and `session` query values

## Side Effects

- `answerCaptureRequests()` runs at module load (`client.ts`): installs a window message listener when the page is inside the capture frame
- `cssFiles` (`server.ts`): recursive `readdir` of `<cwd>/src` on disk
- `createTargetStore({dir: join(server.stateDir, 'design')})` (`server.ts`): the target store is rooted at the `design` directory under the server state dir
- `input.bundler?.subscribe` (`server.ts`): subscribes to bundler diagnostics; the unsubscribe function is exposed as `dispose`

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
