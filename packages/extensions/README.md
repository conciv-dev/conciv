# packages/extensions

## Overview

Each subdirectory is a separate pnpm package with its own `package.json`, build (tsdown and/or vite) and test scripts. The packages are design (visual diff against a target image), recorder (rrweb recording and replay) and tanstack (TanStack Router and Query inspection). The package descriptions say they are installed through `@conciv/it` and not directly.

## Subdirectories & Boundaries

- [design](./design/README.md): Package root of `@conciv/extension-design`. It holds the build configs for the server/defs/provenance bundles (tsdown), the browser client bundle (vite), the xray Solid page (vite + UnoCSS) and declaration emit.
- [recorder](./recorder/README.md): Package root of @conciv/extension-recorder, the built-in recorder extension. It records the host page with rrweb, keeps a server-side sliding window of events, gives agents tools that return an action log, and shows a replay panel.
