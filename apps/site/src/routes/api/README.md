# api

## Overview

JSON server routes: docs search and the GitHub star count.

## Interface

- `/api/search` (`search.ts`): GET, `createFromSource(source, {language: 'english'})` fumadocs search
- `/api/stars` (`stars.ts`): GET, returns `{stars}` from the GitHub repo API

## Invariants

- `star-count.server.ts:readStarCount` (shared with the root loader): any fetch, status or parse failure returns `null`, never an error response, and a `null` is never cached (`validate`)
- `stars.ts`: success is cached `public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400`; failure `public, max-age=60`

## Side Effects

- `star-count.server.ts:readStarCount`: `fetch` to `https://api.github.com/repos/<user>/<repo>` with `user-agent: conciv-site`, through an ocache cached function made per call (`maxAge` 600 s, stale-while-revalidate up to a day, background refresh through `waitUntil` from `cloudflare:workers`) whose storage is the Workers Cache API (`caches.open('ocache')`, per data center)

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
