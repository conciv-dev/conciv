# site-snippets

## Overview

Landing page install snippets for `apps/site` and the generator that pre-highlights them. It stays on TypeScript 6 (`catalog:ts6`) because twoslash 0.3.9 needs the classic TypeScript API; the site itself is on TypeScript 7.

## Invariants

- `src/framework-snippets.gen.ts` is generated: edit `src/framework-snippets.ts`, then run `pnpm --filter site-snippets gen:snippets` (`src/scripts/highlight-snippets.ts`, which renders the snippets with shiki and twoslash).

## Side Effects

- `highlight-snippets.ts`: overwrites `src/framework-snippets.gen.ts`

## Verification

- Run: `pnpm exec turbo run typecheck --filter=site-snippets` and `pnpm lint` from the repo root, then regenerate after editing snippets
