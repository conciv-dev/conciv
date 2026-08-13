# Sources for conciv-setup

Derived by re-reading `SKILL.md` and matching each inline `` `file:line` `` citation to the section
it appears in. A file listed under "General" is in the flat `## Sources` list at the bottom of
`SKILL.md` but is not cited by line number in any one paragraph — it backs the skill as a whole
(a type definition, a package manifest, a whole reference doc) rather than one claim.

## Overview

- `apps/site/content/docs/quick-start/rollup.mdx`
- `apps/site/content/docs/quick-start/vite.mdx`
- `apps/site/content/docs/quick-start/webpack.mdx`
- `packages/core/src/config.ts`
- `packages/it/README.md`

## Decision: plugin vs manual mount

- `apps/site/content/docs/quick-start/index.mdx`
- `packages/it/package.json`

## Zero-config: Vite

- `apps/site/content/docs/quick-start/vite.mdx`

## Zero-config: Next.js

- `apps/site/content/docs/quick-start/nextjs.mdx`

## webpack / Rspack: plugin boots the engine, you inject the widget

- `apps/site/content/docs/quick-start/esbuild.mdx`
- `apps/site/content/docs/quick-start/rollup.mdx`
- `apps/site/content/docs/quick-start/rspack.mdx`
- `apps/site/content/docs/quick-start/webpack.mdx`
- `packages/cli/src/init/steps/framework/webpack-family.ts`
- `packages/plugin/src/index.ts`

## Manual mount: `@conciv/embed`

- `packages/embed/src/mount.ts`
- `packages/extensions/tanstack/test/host/main.tsx`
- `packages/react/src/index.ts`

## Connecting a harness

- `apps/site/content/docs/configuration.mdx`
- `packages/harness/src/_shared/stub.ts`
- `packages/harness/src/pi/index.ts`
- `packages/protocol/src/config-types.ts`

## Minimal config surface

- `apps/site/content/docs/configuration.mdx`
- `packages/core/src/config.ts`
- `packages/core/src/start.ts`
- `packages/embed/src/mount.ts`
- `packages/protocol/src/config-types.ts`

## Red flags — stop and fix

- `packages/harness/src/pi/index.ts`

## General (supports the whole skill, not one section)

- `packages/embed/package.json`
- `packages/harness/src/gemini-cli/index.ts`
- `packages/harness/src/opencode/index.ts`
