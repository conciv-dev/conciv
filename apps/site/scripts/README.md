# scripts

## Overview

Build-time scripts: build a JSON manifest of the site's own source.

## Interface

- `buildManifest(siteDir)` (`build-source-manifest.mjs`): maps text files under `src/` plus `package.json` to their contents; run directly it writes `public/site-source.json`

## Invariants

- `build-source-manifest.mjs:isSecretFile`: paths matching `SECRET_PATTERN` (env, secret, credential, key, token, password segments) are never included
- `build-source-manifest.mjs:isTextFile`: only `.ts`, `.tsx`, `.css`, `.md`, `.mdx`, `.json`, `.txt`, `.svg` files are included

## Side Effects

- `build-source-manifest.mjs`: writes `public/site-source.json`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
