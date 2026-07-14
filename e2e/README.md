# e2e

Repo-wide end-to-end tests. Each directory is a consumer app scaffolded with its framework's
official CLI, wired with `@conciv/it` exactly the way a real user would, plus its own Playwright
suite (`tests/` + `playwright.config.ts`). Layout follows TanStack Router's `e2e/`.

## Why these exist

The `@conciv/it` vite plugin serves `@conciv/*` packages from `src/` inside this monorepo
(`concivSrcEntry` probe), so every in-repo app hides how the published `dist/` behaves in a
consumer vite app. These suites run with `CONCIV_E2E=1`, which turns the src probe off
(`packages/plugin/src/core/vite.ts`), so the widget is served from `dist/` — the real consumer
path. Vite apps also run with `--force` (or a cleared cache) so every run is a cold
dep-optimization start, which is where dist-only failures show up.

## Running

```sh
pnpm e2e                            # from the repo root: builds, then runs every app suite
pnpm --filter conciv-e2e-vite-vanilla test:e2e   # one app (build @conciv/it first)
```

`pnpm test` does not run these.

## Apps

| App              | Scaffold CLI               | Covers                                           |
| ---------------- | -------------------------- | ------------------------------------------------ |
| `vite-vanilla`   | `create vite` (vanilla-ts) | smallest consumer, dist widget in plain vite dev |
| `vite-react`     | `create vite` (react-ts)   | typical React consumer                           |
| `vite-solid`     | `create vite` (solid-ts)   | Solid host: dedupe/context-split hazards         |
| `svelte`         | `sv create` (SvelteKit)    | vite SSR host                                    |
| `solid-start`    | `create solid` (Start v2)  | Solid SSR host                                   |
| `tanstack-start` | `create @tanstack/start`   | TanStack Start SSR + devtools defer path         |
| `nextjs`         | `create next-app`          | `@conciv/it/plugin/nextjs`, Turbopack            |
| `astro`          | `create astro` (minimal)   | MPA vite host                                    |

`e2e-utils` holds the shared Playwright config factory, the widget boot assertions, and the fixed
port registry (`src/ports.ts`) so suites can run side by side.

## Adding an app

1. Scaffold into `e2e/<name>` with the framework's official CLI.
2. Add the app to `E2E_PORTS` in `e2e-utils/src/ports.ts`.
3. Add `@conciv/it` (`workspace:*`) and wire the plugin the way the framework's docs say.
4. Add `@conciv/e2e-utils` + `@playwright/test` dev deps, a `test:e2e` script, a
   `playwright.config.ts` built from `e2eConfig(...)`, and a `tests/widget.spec.ts`.
5. Add `e2e/<name>/**` to `ignorePatterns` in `.fallowrc.json` (scaffold output is not audited,
   same as `apps/examples/**`).
