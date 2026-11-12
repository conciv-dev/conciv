# site-snippets

## Overview

Landing page install snippets for `apps/site` and the generator that pre-highlights them. It stays on TypeScript 6 (`catalog:ts6`) because twoslash 0.3.9 needs the classic TypeScript API; the site itself is on TypeScript 7.

## Interface

- `site-snippets`: `FRAMEWORK_SNIPPETS`, `FrameworkSnippet`, `cleanSnippet` (`src/framework-snippets.ts`)
- `site-snippets/generated`: `MAGIC_MOVE_STEP_IDS`, `MAGIC_MOVE_STEPS`, `SNIPPET_TWOSLASH` and their types (`src/framework-snippets.gen.ts`, generated)
- `src/scripts/highlight-snippets.ts`: renders `FRAMEWORK_SNIPPETS` with shiki, twoslash and `codeToKeyedTokens`; run by `pnpm --filter site-snippets gen:snippets`

## Side Effects

- `highlight-snippets.ts`: overwrites `src/framework-snippets.gen.ts`

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=site-snippets` from the repo root, then regenerate after editing snippets
