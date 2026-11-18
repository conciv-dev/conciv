---
'@conciv/plugin-tanstack': patch
---

The TanStack plugin's engine part runs on Effect: its build-error and server-function rings are `Ref` services, `build_errors` follows the latest dev-server status and waits at most `bundlerWaitMs` (default 10000, set it with `['@conciv/plugin-tanstack', {bundlerWaitMs}]`) before it fails with `BUNDLER_UNAVAILABLE`, and an undecodable server-function request is logged at debug level instead of dropped silently.

The browser half runs on Effect too: each page operation is one Effect, the page's runtime errors fill a per-tab `Ref` ring, and a page with no TanStack Router or QueryClient now answers the finer codes `router_not_found` and `query_client_not_found` instead of `handler_error`.

The route manifest reads `src/routeTree.gen.ts` through the host's `FileSystem` and `Path` services instead of `node:fs` and `node:path`.

An invalid option now fails the plugin's activation with `Tanstack.InvalidOptions` (listed as `failed to load plugin: Tanstack.InvalidOptions: <reason>`), and a failed rpc registration with `Tanstack.RpcRegisterFailed`, while the other plugins keep loading.
