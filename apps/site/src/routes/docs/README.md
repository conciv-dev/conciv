# docs

## Overview

Docs page route rendered from fumadocs MDX, and a markdown variant for each page.

## Interface

- `/docs/$` (`$.tsx`): loader resolves the page from `source`, `head` from `buildDocsHead`
- `/docs/{$}.md` (`{$}[.]md.ts`): GET returns the page's processed markdown
- `/docs.md` (`../docs[.]md.ts`): GET returns the docs index markdown, the same as `/docs/index.md`

## Invariants

- `$.tsx`: an unknown page throws `notFound()`; `{$}[.]md.ts`: an unknown page answers 404 text

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
