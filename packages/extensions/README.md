# packages/extensions

## Overview

Each subdirectory is a separate pnpm package with its own `package.json`, build (tsdown and/or vite) and test scripts. The one package left is design (visual diff against a target image), out of the release and not yet a plugin; every other extension is now a plugin under `packages/plugins` or `packages/builtin-plugins`.

## Subdirectories & Boundaries

- [design](./design/README.md): Package root of `@conciv/extension-design`. It holds the build configs for the server/defs/provenance bundles (tsdown), the browser client bundle (vite), the xray Solid page (vite + UnoCSS) and declaration emit.
