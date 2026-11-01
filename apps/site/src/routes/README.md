# routes

## Overview

Top-level file routes of the site: root document, landing, brand page, and server routes for `llms.txt`, sitemap, default OG image and pairing instructions.

## Interface

- root `Route` (`__root.tsx`): `validateSearch: rootSearchSchema`, head tags from `seo`, `canonicalHeadTags`, `buildRootJsonLd`; renders `RootProvider` and `LiveWidgetMount`
- `/` (`index.tsx`): landing page
- `/brand` (`brand.tsx`): brand assets page
- `/llms.txt`, `/llms-full.txt` (`llms[.]txt.ts`, `llms-full[.]txt.ts`): GET text indexes of the docs
- `/sitemap.xml` (`sitemap[.]xml.ts`): GET, `Content-Type: application/xml`
- `/og.png` (`og[.]png.ts`): GET default OG image with `OG_IMAGE_CACHE_HEADERS`
- `/pair/$token` (`pair.$token.ts`): GET markdown from `pairResponse(params.token, 'https://conciv.dev')`
- Subdirectories: [api](./api/README.md), [docs](./docs/README.md), [og](./og/README.md)

## Invariants

- `__root.tsx`: search params are validated by `rootSearchSchema`; invalid values become `undefined`

## Side Effects

- `__root.tsx`: `LiveWidgetMount` mounts the live conciv widget in the browser
- `og[.]png.ts`: loads fonts through the `ASSETS` binding

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
