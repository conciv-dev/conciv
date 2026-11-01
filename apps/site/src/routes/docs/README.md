# docs

## Overview

Docs page route rendered from fumadocs MDX, and a markdown variant for each page.

## Interface

- `/docs/$` (`$.tsx`): loader resolves the page from `source`, `head` from `buildDocsHead`
- `/docs/{$}.md` (`{$}[.]md.ts`): GET returns the page's processed markdown

## Invariants

- `$.tsx`, `{$}[.]md.ts`: an unknown page throws `notFound()`

## Side Effects

- None

## Verification

- Run: `cd apps/site && pnpm typecheck && pnpm lint && pnpm test`
