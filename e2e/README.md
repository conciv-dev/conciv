# e2e

Repo-wide end-to-end tests. Each directory is a consumer app scaffolded with its framework's
official CLI, wired with `@conciv/it` exactly the way a real user would, plus its own Playwright
suite (`tests/` + `playwright.config.ts`). Layout follows TanStack Router's `e2e/`.

## Why these exist

Every host, in-repo or not, consumes `@conciv/*` packages from `dist/`. These apps add what the
in-repo apps cannot: each is scaffolded by its framework's own CLI and wired the way a user would,
so they catch what a real consumer setup does with the published `dist/`. Vite apps also run with
`--force` (or a cleared cache) so every run is a cold dep-optimization start, which is where
dist-only failures show up.

## Running

```sh
pnpm e2e                            # from the repo root: builds, then runs every app suite
pnpm --filter conciv-e2e-vite-vanilla test:e2e   # one app (build @conciv/it first)
```

`pnpm test` does not run these.

A `prepare` script here must not load the app's framework config. `prepare` runs during
`pnpm install`, when no `@conciv/*` package has a `dist/` yet, and every app's config imports
`@conciv/it`: `vite.config.ts` in the vite and SvelteKit apps, `next.config.ts` in `nextjs` and
`nextjs-component`, `astro.config.mjs` in `astro`. Loading one at install time fails with
`ERR_MODULE_NOT_FOUND` and fills the log with a stack trace, even when the command shrugs it off
and exits 0. Whatever the config would have generated (SvelteKit's `.svelte-kit`, for example)
gets generated anyway by `build` and `dev`, which run after `turbo build`. A `prepare` script that
touches none of this is fine.

## Apps

| App                     | Scaffold CLI               | Covers                                                          |
| ----------------------- | -------------------------- | --------------------------------------------------------------- |
| `vite-vanilla`          | `create vite` (vanilla-ts) | smallest consumer, dist widget in plain vite dev                |
| `vite-react`            | `create vite` (react-ts)   | typical React consumer                                          |
| `vite-solid`            | `create vite` (solid-ts)   | Solid host: dedupe/context-split hazards                        |
| `svelte`                | `sv create` (SvelteKit)    | vite SSR host                                                   |
| `solid-start`           | `create solid` (Start v2)  | Solid SSR host                                                  |
| `tanstack-start`        | `create @tanstack/start`   | TanStack Start SSR + devtools defer path                        |
| `nextjs`                | `create next-app`          | `@conciv/it/plugin/nextjs`, Turbopack                           |
| `astro`                 | `create astro` (minimal)   | MPA vite host                                                   |
| `vite-react-component`  | copy of `vite-react`       | `@conciv/react` `<ConcivWidget/>` path, plugin `widget: false`  |
| `nextjs-component`      | copy of `nextjs`           | `@conciv/react` under app router: RSC `'use client'` boundary   |
| `vite-preact-component` | copy of `vite-react`       | `@conciv/preact` `<ConcivWidget/>` path, plugin `widget: false` |
| `vite-solid-component`  | copy of `vite-solid`       | `@conciv/solid` `<ConcivWidget/>` path, plugin `widget: false`  |
| `vite-react-packed`     | copy of `vite-react`       | published-tarball pnpm install, catches dist/packaging bugs     |

`vite-react-packed` installs conciv the way an npm user does. Its `test:e2e` runs `install-packed.ts`
first: `pnpm pack` on every package in `@conciv/it`'s production dependency chain, then a copy of
`app/` in a temp dir outside the workspace whose `pnpm-workspace.yaml` overrides each `@conciv/*` to
its tarball, then a plain `pnpm install` there (isolated layout, non-conciv deps from the registry).
Playwright still runs from `e2e/vite-react-packed`, so it uses `e2e-utils` from the workspace; only
the vite dev server runs in the temp copy.

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
