---
'@conciv/plugin-tanstack': patch
---

The TanStack plugin's engine part runs on Effect: its build-error and server-function rings are `Ref` services, `build_errors` follows the latest dev-server status and waits at most `bundlerWaitMs` (default 10000, set it with `['@conciv/plugin-tanstack', {bundlerWaitMs}]`) before it fails with `BUNDLER_UNAVAILABLE`, and an undecodable server-function request is logged at debug level instead of dropped silently.
