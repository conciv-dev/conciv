# scripts

## Overview

Build-time scripts: copy the widget bundle, build a JSON manifest of the site's own source, and pre-highlight the landing page code snippets.

## Interface

- `copy-widget-bundle.mjs`: copies `packages/embed/dist/conciv-widget.global.js` to `public/conciv-widget.global.js`
- `buildManifest(siteDir)` (`build-source-manifest.mjs`): maps text files under `src/` plus `package.json` to their contents; run directly it writes `public/site-source.json`
- `highlight-snippets.ts`: renders `FRAMEWORK_SNIPPETS` with shiki, twoslash and `codeToKeyedTokens`, writes `MAGIC_MOVE_STEPS` and `SNIPPET_TWOSLASH`; run by `pnpm gen:snippets`

## Invariants

- `build-source-manifest.mjs:isSecretFile`: paths matching `SECRET_PATTERN` (env, secret, credential, key, token, password segments) are never included
- `build-source-manifest.mjs:isTextFile`: only `.ts`, `.tsx`, `.css`, `.md`, `.mdx`, `.json`, `.txt`, `.svg` files are included

## Side Effects

- `copy-widget-bundle.mjs`: creates `public/` and copies a file into it
- `build-source-manifest.mjs`: writes `public/site-source.json`
- `highlight-snippets.ts`: overwrites `src/components/landing/framework-snippets.gen.ts`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
