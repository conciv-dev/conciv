# api

## Overview

JSON server routes: docs search and the GitHub star count.

## Interface

- `/api/search` (`search.ts`): GET, `createFromSource(source, {language: 'english'})` fumadocs search
- `/api/stars` (`stars.ts`): GET, returns `{stars}` from the GitHub repo API

## Invariants

- `stars.ts:fetchStarCount`: any fetch, status or parse failure returns `null`, never an error response
- `stars.ts`: success is cached `public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400`; failure `public, max-age=60`

## Side Effects

- `stars.ts:fetchStarCount`: `fetch` to `https://api.github.com/repos/<user>/<repo>` with `user-agent: conciv-site`

## Verification

- Run: `cd apps/site && pnpm typecheck && pnpm lint && pnpm test`
