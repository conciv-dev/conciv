# e2e

Repo-wide end-to-end tests. Each directory is a consumer app scaffolded with its framework's
official CLI, wired with `@conciv/it` exactly the way a real user would, plus its own Playwright
suite (`test/` + `playwright.config.ts`). Layout follows TanStack Router's `e2e/`.

## Why these exist

Every host, in-repo or not, consumes `@conciv/*` packages from `dist/`. These apps add what the
in-repo apps cannot: each is scaffolded by its framework's own CLI and wired the way a user would,
so they catch what a real consumer setup does with the published `dist/`. In CI (`CI` set) Vite apps
run with `--force`, so every run is a cold dep-optimization start, which is where dist-only failures
show up. Local runs leave it off and reuse the warm Vite cache: measured 2026-11-22, a cold start costs
1.8 GB and 4.6 s against 0.46 GB and 1.7 s warm. `e2eConfig` and `harnessMatrixConfig` decide this in
one place and hand each app's `command` the flag as its `coldStart` argument. Astro clears
`node_modules/.vite` on every start instead (`astro dev` has no dep-optimizer `--force`).

## Running

```sh
pnpm e2e                            # from the repo root: builds, then runs every app suite
pnpm --filter conciv-e2e-vite-vanilla test:e2e   # one app (build @conciv/it first)
```

`pnpm test` does not run these.

Specs import `test` from `@conciv/e2e-utils/fixtures`: it signs `page` and `secondPage` in before each test
(`test.use({signedIn: false})` opts out). `vite-react` starts its dev server fresh for every test, on a free
port with an empty `.conciv` and conciv home folder and a new temp folder as `HOME`, so no test sees another's
state; the framework apps start theirs once per run.

A `prepare` script here must not load the app's framework config. `prepare` runs during
`pnpm install`, when no `@conciv/*` package has a `dist/` yet, and every app's config imports
`@conciv/it`: `vite.config.ts` in the vite and SvelteKit apps, `next.config.ts` in `nextjs` and
`nextjs-component`, `astro.config.mjs` in `astro`. Loading one at install time fails with
`ERR_MODULE_NOT_FOUND` and fills the log with a stack trace, even when the command shrugs it off
and exits 0. Whatever the config would have generated (SvelteKit's `.svelte-kit`, for example)
gets generated anyway by `build` and `dev`, which run after `turbo build`. A `prepare` script that
touches none of this is fine.

`nextjs`, `nextjs-component` and the `nextjs` packed fixture set Next's `experimental.agentUpgrade: false`:
Next 16 `next dev` exits 1 on its first start in an app folder when it detects a coding agent, to show an
upgrade reminder. CI is not affected.

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

`vite-react-packed` installs conciv the way an npm user does, using the packing helpers in
`packages/vitest-config/src/pack.ts` (`@conciv/vitest-config/pack`, shared with `nextjs/packed` and the
packages' packed describes). Its `test:packed` runs `test/test-packed.ts`:
it builds and `pnpm pack`s `@conciv/it`'s workspace dependency closure, copies `index.html`, `src/` and
`public/` from `vite-react` into a temp dir outside the workspace, generates the `package.json` and
`vite.config.ts`, overrides each `@conciv/*` to its tarball and runs `pnpm install` there, seeded from
the committed `fixture-lock.yaml` and checked for drift. Then it runs Playwright with
`e2e/vite-react-packed/playwright.config.ts` from inside the temp copy, where the vite dev server and its
engine run, so the shared `vite-react` specs log in against that engine's `.conciv/server.json` (the
same project directory `loginWidget` reads for every other app).

### Packed suites run only in CI

Everything that packs runs only in `.github/workflows/packed.yml`, never in `pnpm test`, `test:e2e`, the
CI planner, or on a laptop. Each suite is a `test:packed` script:

- `vite-react-packed`: the whole app (it has no `test:e2e`).
- `nextjs`: `packed/test-packed.ts` packs `@conciv/it`'s closure, installs the committed `packed/app`
  fixture twice into a temp dir outside the workspace (`packages/turbopack` and `packages/webpack`, only
  their `package.json` generated), then runs `playwright.packed.config.ts`: one `next dev` web server and
  one project per bundler, each with its own engine port and `CONCIV_HOME`, running the specs named
  `test/packed-*.spec.ts`. The shared `e2eConfig` ignores that pattern, so `test:e2e` never picks them up.
- `mascot`, `mascot-react`, `plugin-tanstack`: describes tagged `packed`; their vitest configs define the
  `packed` tag as skipped unless vitest runs in `packed` mode, and `test:packed` runs
  `vitest run --mode packed --tags-filter=packed` (with `--project <node project>` where the config has
  several projects). Any other vitest run skips
  them (hooks too).

Every pack helper in `@conciv/vitest-config/pack` (`packTarball`, `buildAndPack`, the firewalled install)
calls `assertPackAllowed()`, which throws outside GitHub Actions, so even a `vitest run <file>:<line>`
that targets a packed test (a line filter overrides the tag skip) fails before anything is packed.
Every fixture install goes through Socket Firewall (`sfw`) with the root `minimumReleaseAge`, and every
produced lockfile is rejected if it resolves a remote tarball or git dependency outside the packed
`@conciv/*@file:` entries.

The workflow runs on pull requests touching what can drift the two fixture lockfiles or change how a
tarball is packed: the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (the catalog),
`patches/`, every `packages/**/package.json` and `apps/conciv/package.json`, the pack helper
`packages/vitest-config/src/pack.ts`, `e2e/vite-react` (which `vite-react-packed` copies),
`e2e/vite-react-packed`, `e2e/nextjs/packed`, the nextjs `test/packed-*.spec.ts` and
`playwright.packed.config.ts`, and `packed.yml` itself; and the packed suites' own files:
`e2e/nextjs/package.json` (its `test:packed` script), the `mascot`, `mascot-react` and
`plugin-tanstack` test files holding the `packed` describes and their `vitest.config.ts` (which define
the `packed` tag). It also runs on demand
(`gh workflow run packed.yml --ref <branch>`). On main it runs only from `release.yml`, on every push,
and npm publish waits on it. A source-only change can still break a packed install; on a pull request
that touches none of those paths, main's Packed run finds it and blocks publish.

Every fixture install (the two locked fixtures, the tanstack resolution matrix and the nextjs trust-policy
install) rejects any remote tarball or git resolution outside the packed `@conciv/*@file:` entries. Only the
two locked fixtures, `e2e/vite-react-packed` and the nextjs packed install (`e2e/nextjs/packed`), also run
the drift guard: when a registry dependency changes, it compares every registry package's `name@version`
and integrity against that fixture's committed `fixture-lock.yaml` and fails the run. The tanstack matrix
and the trust-policy install resolve fresh on every run and have no committed lock to drift from. On drift the CI run writes the lockfile it
produced over the committed one, shows the diff in the run summary and uploads both fixture locks as the
`packed-fixture-locks` artifact. Refresh from that run, never locally:

1. Take the id of the failed Packed run (on your PR, or one you dispatched on the branch with
   `gh workflow run packed.yml --ref <branch>`): `gh run list --workflow packed.yml --branch <branch>`.
2. `gh run download <run-id> -n packed-fixture-locks -D e2e`. Always download by the run id: a fork PR can
   upload an artifact with the same name.
3. Before committing, check the diff holds only the expected `name@version` changes, and no tarball or git
   resolution other than the `@conciv/*@file:` entries.

`e2e-utils` holds the shared Playwright config factory and the widget boot assertions. No dev server has a
fixed port: the config asks the system for a free port once, in the Playwright runner, and pins it in a
`CONCIV_E2E_<SERVER>_PORT` environment variable that the workers read back when they load the config again.
Two apps, or one app in two worktrees, run side by side. A spec reaches its server through `baseURL`, and a
second server through its pinned variable.

## Adding an app

1. Scaffold into `e2e/<name>` with the framework's official CLI.
2. Add the app's name to the `E2EApp` names in `e2e-utils/src/config.ts`.
3. Add `@conciv/it` (`workspace:*`) and wire the plugin the way the framework's docs say.
4. Add `@conciv/e2e-utils` + `@playwright/test` dev deps, a `test:e2e` script, a
   `playwright.config.ts` that exports `await e2eConfig(...)`, and a `test/widget.spec.ts`.
5. Add `e2e/<name>/**` to `ignorePatterns` in `.fallowrc.json` (scaffold output is not audited,
   same as `apps/examples/**`).
