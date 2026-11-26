# it/src/plugin

## Overview

One entry file per bundler subpath of `@conciv/it/plugin/*`. Each re-exports the matching hook of the shared unplugin instance, or the Next.js helpers from `@conciv/unplugin`.

## Invariants

- None

## Side Effects

- `nextjs-widget.ts` - importing it runs the widget loader from `@conciv/unplugin/nextjs/widget`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
