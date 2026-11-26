# @conciv/bundle-size

## Overview

Private CI tool that measures the gzip size of published package dists, the widget bundle and the apps/site Cloudflare worker, and compares them to a main-branch baseline. It has no build step: the bin (`conciv-bundle-size` -> `./src/cli.ts`) runs the TypeScript source directly. Source: [src/README.md](./src/README.md).

## Invariants

- `private: true` (`package.json`): never published.
- `tsconfig.json` extends `@internal/tsconfig/tsconfig.base.json` with `allowImportingTsExtensions`, so the bin can run `.ts` directly.

## Side Effects

- None at the package root; see the src contract

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@conciv/bundle-size` from the repo root
