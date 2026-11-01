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

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
