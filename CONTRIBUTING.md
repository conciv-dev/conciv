# Contributing to conciv

Thanks for taking a look. conciv is pre-1.0 and moves fast, but we'd love your help — bug
reports, docs fixes, and small PRs are all welcome.

## Setup

You need pnpm (the version pinned in the root `package.json`'s `packageManager` field) and
Node.js >= 22.

```sh
git clone https://github.com/conciv-dev/conciv.git
cd conciv
pnpm install
```

`pnpm install` also activates the pre-commit hook (via the `prepare` script) — no extra setup
step needed.

## Everyday commands

This is a pnpm + turbo monorepo.

| Command             | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| `pnpm build`        | Build all packages                                                                      |
| `pnpm typecheck`    | Typecheck all packages                                                                  |
| `pnpm test`         | Run all tests (this also builds first — turbo caches, so it isn't a separate slow step) |
| `pnpm lint`         | Lint with oxlint                                                                        |
| `pnpm format`       | Format with oxfmt                                                                       |
| `pnpm format:check` | Check formatting without writing                                                        |

To scope a command to one package and its dependencies:

```sh
turbo run test --filter=@conciv/some-package...
```

For local iteration on a branch, the affected-only shortcuts are usually faster:

```sh
pnpm test:affected
pnpm typecheck:affected
pnpm build:affected
```

### Dev loop

`pnpm dev` boots the workspace in watch mode. Browser packages (ui-kits, the Solid libraries,
client/grab/page/storage-history) hot-serve straight from `src/`, so editing and reloading is
enough — no rebuild needed. Two exceptions: `@conciv/extension` and any node-side package (core,
harness, tools, plugin) always resolve from `dist/`, so a widget change needs `pnpm turbo run
build --filter=@conciv/embed` and a server-side change needs a dev-server restart.

## Where tests live

- Widget UI is tested in a real browser (Playwright/Chromium) — never jsdom or happy-dom.
- Node/server logic is tested with Vitest.
- Example apps under `apps/examples/*` are demos, not test subjects — we verify behavior through
  the owning package's tests instead.
- Whiteboard tests (`packages/extensions/whiteboard/test`) only run in CI, never locally.

## Code style

- **Functions, not classes.** (One narrow exception in the codebase, documented at its
  definition.)
- **No IIFEs**, unless a specific situation genuinely requires one.
- **Zero code comments** in TypeScript/JavaScript. A lint rule (`conciv/no-comments`) will
  autofix-delete anything that isn't a `@ts-`/`eslint-` directive, so write self-explanatory code
  instead of explaining it in a comment.
- TypeScript is strict. Avoid `any`, `as` casts, and `@ts-ignore`.
- Formatting is handled by oxfmt (no semicolons, single quotes, trailing commas) — run
  `pnpm format` rather than hand-formatting.
- No abbreviated identifiers, no non-null assertions (`!`), kebab-case file names.

These aren't arbitrary preferences: several are enforced by lint rules and will fail CI if
skipped.

## Before you open a PR

1. Run `pnpm typecheck && pnpm test && pnpm lint` (or the `:affected` variants for a large repo,
   full run before pushing).
2. Run `pnpm exec fallow audit --changed-since main --format json` and fix anything it reports as
   newly introduced (dead code, unused exports, duplication, new circular deps). CI runs the same
   check and blocks on new findings.
3. Keep the PR focused — one logical change per PR is much easier to review than a bundle of
   unrelated fixes.
4. Write a commit message and PR description that explain _why_, not just _what_.

## Project status

conciv is pre-release (v0) with no external users yet, so we reshape internal APIs freely.
Breaking an internal contract to make the design better is fine — just update the call sites in
the same PR.

## Releasing

Publishing to npm is CI-only via OIDC trusted publishing; there's no way to publish from a
laptop. If your change should ship, add a changeset (`pnpm changeset`) describing it — a
maintainer's merge to `main` takes care of the rest.

## Questions

Open a [GitHub issue](https://github.com/conciv-dev/conciv/issues) — for bugs, a minimal repro
helps enormously; for questions or ideas, the `question` label is a good fit.
