# @conciv/extension-compiler

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3)]:
  - @conciv/extension@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.10

## 0.0.9

### Patch Changes

- [`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195) Thanks [@omridevk](https://github.com/omridevk)! - The dist widget now boots cleanly in real consumer vite apps: the plugin pre-warms the widget module graph (`server.warmup`) so a cold dep-optimizer sees every widget dependency before its first run instead of re-optimizing mid-flight (504 Outdated Optimize Dep, full reloads); `optimizeDeps.exclude` yields to another plugin's `include` (vite-plugin-solid hosts like solid-start no longer crash with "entry point solid-js cannot be marked as external"); Solid singleton dedupe/exclude ids apply only where resolvable from the app root, fixing vite 7 hosts and React hosts whose optimized deps embed Solid (TanStack devtools).

- Updated dependencies []:
  - @conciv/extension@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail — a resizable, open-by-default timeline of session activity — and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies []:
  - @conciv/extension@0.0.8
