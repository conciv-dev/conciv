# Contributing to conciv

Thanks for taking a look. conciv is pre-1.0 and moves fast, so the best first step is to run the
[example app](./apps/examples/tanstack-start), poke around, find something rough, and open an
issue. Bug reports, docs fixes, and small PRs are all welcome. Browse existing work on the
[issue tracker](https://github.com/conciv-dev/conciv/issues), and if you want a place to start,
look for issues labeled
[`good first issue`](https://github.com/conciv-dev/conciv/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22).

## Setup

You need Node.js >= 22.13 and pnpm. The exact pnpm version is pinned in root `package.json`'s
`packageManager` field; use [corepack](https://nodejs.org/api/corepack.html) to get that exact
version instead of whatever you have installed globally:

```sh
git clone https://github.com/conciv-dev/conciv.git
cd conciv
corepack enable
pnpm install
```

`pnpm install` also activates the pre-commit hook (via the `prepare` script, which runs
`prek install`), so there's no extra setup step needed.

Then start the dev loop:

```sh
pnpm dev
```

This runs the [`tanstack-start` example app](./apps/examples/tanstack-start) with conciv wired
in, so you get a live page with the widget attached.

## Repo layout

| Path             | What's there                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/conciv`    | `@conciv/app`, the widget host app used for local dev                                                                                  |
| `apps/examples`  | Demo consumer apps (`tanstack-start`, `nextjs-app`) that embed conciv                                                                  |
| `apps/site`      | conciv.dev, the marketing/docs site (React + TanStack Start)                                                                           |
| `apps/storybook` | Component storybook for the Solid UI kits                                                                                              |
| `packages/`      | ~40 published/internal packages: server/core logic, the browser client, extension system, and the Solid `ui-kit-*` component libraries |

## Everyday commands

This is a pnpm + turbo monorepo.

| Command             | What it does                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `pnpm build`        | Build all packages                                                                |
| `pnpm typecheck`    | Typecheck all packages                                                            |
| `pnpm test`         | Run all tests (this builds first, turbo caches, so it isn't a separate slow step) |
| `pnpm lint`         | Lint with oxlint                                                                  |
| `pnpm format`       | Format with oxfmt                                                                 |
| `pnpm format:check` | Check formatting without writing                                                  |

To scope a gate to a single package, filter it bare:

```sh
pnpm turbo run test --filter=@conciv/some-package
```

Careful with trailing dots: `--filter=@conciv/some-package...` means "this package **and all its
dependencies**", which can turn one test suite into dozens. Leave the filter bare unless you
specifically want the dependency fan-out.

For local iteration on a branch, the affected-only shortcuts are usually faster:

```sh
pnpm test:affected
pnpm typecheck:affected
pnpm build:affected
```

## Testing rules that matter to contributors

- Widget UI is tested in a real browser (Playwright/Chromium), never jsdom or happy-dom.
- Widget integration tests load the prebuilt embed bundle, so rebuild it first or you'll be
  testing stale code: `pnpm turbo run build --filter=@conciv/embed`.
- Don't add tests under `apps/examples/*`: example apps are demos, not test subjects. Verify
  behavior through the owning package's own tests instead.
- The whiteboard test suite (`packages/extensions/whiteboard/test`) only runs in CI, never
  locally.

## Code style

- **Functions, not classes.**
- **No IIFEs**, unless a specific situation genuinely requires one.
- **Zero code comments** in TypeScript/JavaScript. A lint rule (`conciv/no-comments`) will
  autofix-delete anything that isn't a `@ts-`/`eslint-` directive, so write self-explanatory code
  instead of explaining it in a comment.
- TypeScript is strict. Avoid `any`, `as` casts, and `@ts-ignore`.
- Formatting is handled by oxfmt (no semicolons, single quotes, trailing commas), so run
  `pnpm format` rather than hand-formatting.
- File names are kebab-case.

This list is the short version. See [`AGENTS.md`](./AGENTS.md) for the full set of conventions,
including router idioms, Solid/Ark landmines, and testing rules.

## Before you open a PR

1. Get everything green: `pnpm typecheck && pnpm test && pnpm lint` (a green `test` run already
   proves the build, since `test` depends on `build`).
2. Run `pnpm exec fallow audit --changed-since main --format json` and fix anything it reports as
   newly introduced (dead code, unused exports, duplication, new circular deps). CI runs the same
   check and blocks on new findings.
3. If your change touches a published package (anything under `packages/` that isn't `private`,
   or `apps/conciv` since it ships inside `@conciv/embed`), add a changeset:
   ```sh
   pnpm changeset
   ```
   If it doesn't need a release note, apply the `no-changeset` label to the PR instead. CI's
   `check-changesets` job blocks merges that have neither.
4. Follow the commit style used in this repo: a conventional-commit prefix, optionally scoped,
   referencing the issue inline when there is one. For example:
   - `feat(ui-kit-chat): #431 transcript virtualization`
   - `fix(conciv): #478 grab card clears on send`
   - `docs: add CONTRIBUTING.md`
   - `chore(storybook): nest extension stories under Extensions/<Name>/tool`
5. Write a PR description that covers: what changed and why, how you verified it (commands you
   ran, manual testing), and a link to the issue it addresses, if any.
6. Keep the PR focused: one logical change per PR is much easier to review than a bundle of
   unrelated fixes.

If a large `git commit` fails with a `next-index-*.lock.lock` error, that's a file-lock race in
the pre-commit hook, not a real problem: run `pnpm format` by hand, then `git commit --no-verify`.

## Project status

conciv is pre-release (v0) with no external users yet, so we reshape internal APIs freely.
Breaking an internal contract to make the design better is fine, just update the call sites in
the same PR.

## Releasing

Publishing to npm is CI-only, via OIDC trusted publishing; contributors never publish from a
laptop. See the "Releasing (npm publish)" section of [`AGENTS.md`](./AGENTS.md) for the full
flow.

## Questions

Open a [GitHub issue](https://github.com/conciv-dev/conciv/issues). For bugs, a minimal repro
helps enormously; for questions or ideas, the `question` label is a good fit.

## Code of conduct and license

Be kind and assume good faith. conciv is [MIT licensed](./LICENSE).
