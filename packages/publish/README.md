# @conciv/publish

Internal release tooling for the aidx monorepo. Not published.

Exposes the `conciv-publish` CLI (citty), invoked by the root release scripts:

| Root script                  | Command                   | What it does                                                         |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `pnpm release:version`       | `conciv-publish version`  | `changeset version` + lockfile resync                                |
| `pnpm release:check`         | `conciv-publish check`    | `turbo run build publint attw`                                       |
| `pnpm release`               | `conciv-publish release`  | public-set and version guards, build + validate, `changeset publish` |
| `pnpm release:snapshot beta` | `conciv-publish snapshot` | prerelease under a dist-tag (e.g. `beta`), not latest                |
| `pnpm release:sync`          | `conciv-publish sync`     | first publish, trusted publishing and git tags for `PUBLIC_PACKAGES` |

Subcommands without a root script: `check-changesets` (`--require-coverage`, `--base`), `check-catalog`, and
`swift-mirror` (`--dry-run`), which mirrors `native/swift` into `conciv-dev/conciv-swift`.

All commands run `changeset`/`turbo` via execa in the current directory, which must be the workspace
root: `assertWorkspaceRoot` throws unless it contains `pnpm-workspace.yaml` and `.changeset`. Run them
through the root scripts.

Each package owns its own publish metadata (`keywords`, `repository`, `homepage`,
`publishConfig`) in its `package.json`. This tool does not manage or enforce it.

## Interface

- [src/README.md](./src/README.md): the command tree, guards, registry, sync plan, workspace graph and Swift mirror helpers.
- `bin["conciv-publish"]` -> `./src/cli.ts`, run as TypeScript with no build step; no exports map (`package.json`).
- Scripts: `typecheck`, `lint` (`oxlint`), `test` (`vitest run`). `vitest.config.ts` uses `ciTest()`.

## Invariants

- The package stays `private: true`: `assertPublicSet` (`src/guards.ts`) fails if a non-private `@conciv/*` package is missing from `PUBLIC_PACKAGES`, and `@conciv/publish` is not in that list.
- Release guards and plan rules are listed in [src/README.md](./src/README.md#invariants).

## Side Effects

- Publishes to npm, configures npm trusted publishing, creates and pushes git tags, and force-pushes the Swift mirror. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/publish` from the repo root (turbo builds the package and its dependencies first)
