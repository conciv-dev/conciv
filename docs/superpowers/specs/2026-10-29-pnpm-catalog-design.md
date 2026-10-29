# pnpm catalog for every shared dependency

Date: 2026-10-29. Branch: `pnpm-catalog` off `main`. Own PR, independent of `calm-chat-plane`.

## Problem

`pnpm-workspace.yaml` already single-sources the `@orpc/*` and `@tanstack/ai*` families through
`catalog:`, and 22 of 75 manifests reference it. Every other shared dependency is declared per
manifest with drifting ranges. Measured on 2026-10-29:

| dependency                                      | specs in use                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| typescript                                      | `^5`, `^6.0.2`, `^6.0.3`, `~6.0.2`                                |
| vite                                            | `^7.0.0`, `^8.0.0`, `^8.0.16`, `^8.1.1`, `^8.1.3`                 |
| solid-js                                        | `^1.9.5`, `^1.9.13`, `^1.9.14`                                    |
| react, react-dom                                | `^19`, `^19.2.0`, `^19.2.7`, `19.2.4`                             |
| @types/node                                     | `^20`, `^22.10.2`, `^22.19.21`, `^22.20.0`, `^24.13.2`, `^26.1.0` |
| @tanstack/react-router family                   | exact, caret and `latest`                                         |
| tailwindcss, @vitejs/plugin-react, lucide-react | three to four specs each                                          |

Consequences: duplicate copies in the lockfile (two `@tanstack/history` versions broke the
`tanstack-start-redact` e2e on PR #597), bumps touching many manifests, and no single answer to
"which version do we run".

## Decision

One `catalog:` block in `pnpm-workspace.yaml` holds the version of every external dependency that
appears in more than one workspace manifest. Every manifest, including `apps/`, `e2e/` and
`apps/examples/`, references those through `"<name>": "catalog:"`. The two e2e apps that pin
`latest` (`e2e/tanstack-start`, `e2e/tanstack-start-redact`) move to the catalog too; tracking
upstream becomes an explicit bump, not an install-time surprise.

Dependencies that appear in exactly one manifest stay where they are. `workspace:` references
stay as they are. `peerDependencies` ranges in published packages stay as ranges (a catalog entry
is for the version we install, a peer range is a compatibility statement to consumers); only
`dependencies` and `devDependencies` move.

Two commits, in this order:

1. **Re-expression.** Version per entry is the highest version already resolved in the committed
   `pnpm-lock.yaml` for that name, in the range style the majority of manifests used (caret unless
   the family was exact-pinned on purpose, like the existing orpc block). No behaviour change; the
   lockfile only gains the `catalogs:` section and importer rewrites.
2. **Upgrade.** Every catalog entry moves to the latest release that `minimumReleaseAge` (48h)
   allows, majors included, lockfile regenerated. Where the latest release is newer than 48h and
   therefore blocked, the entry stays on the newest allowed version and the blocked one goes in a
   table in the PR body (name, installed, latest, hours until allowed) for a per-entry veto or an
   `minimumReleaseAgeExclude` addition by the user. Families that must move in lockstep (orpc,
   `@tanstack/ai*`, `@tanstack/*router*`/`start*`/`history`, vite + plugins, storybook + addons,
   react + react-dom + types, solid-js + solid-primitives) move together. Any upgrade that breaks
   typecheck, build or tests gets fixed at the call site when the fix is mechanical, otherwise the
   entry is held at the previous version and listed in the PR body with the error.

## Non-goals

- No named catalogs. One catalog. If a real split is ever needed, that is its own change.
- No `overrides` changes.
- No changes under `packages/*/src`.

## Verification

1. `pnpm install` with no lockfile changes other than the `catalogs:` section and importer spec
   rewrites (`pnpm install --frozen-lockfile` must pass after the regenerated lockfile is committed).
2. `pnpm-lock.yaml` has at most one version of each catalogued name in `packages:` unless a
   transitive dependency forces another; list any remaining duplicates in the PR body.
3. Publishing: `pnpm pack` in two published packages (`@conciv/embed`, `@conciv/ui-kit-chat`)
   and inspect the packed `package.json`: every `catalog:` must be replaced with a concrete
   version. `pnpm release:check` (build + publint + attw) passes.
4. Changesets: `pnpm changeset version` in a dry run (do not commit its output) still works with
   `catalog:` specs (`@changesets/cli` 2.31 supports pnpm catalogs).
5. `pnpm typecheck`, `pnpm build`, `pnpm test` green locally, serially.
6. e2e: `conciv-e2e-tanstack-start-redact` and `conciv-e2e-tanstack-start` boot (their `latest`
   specs changed meaning).
7. Fallow audit clean.
8. A guard so drift cannot return: extend `packages/publish/src/guards.ts` (or the existing
   `check-changesets`/repo-checks entry point, whichever already walks manifests) with a check that
   fails when an external dependency name appears in two or more workspace manifests without a
   `catalog:` spec. Wire it into the existing `repo checks` CI job. Single-manifest deps are
   allowed to stay explicit.

## Rollout

One PR, one changeset (`chore`, patch on `@conciv/*` since published manifests change shape).
Merge after `calm-chat-plane` (#597) lands to avoid a lockfile conflict storm; if #597 drags,
rebase this branch, not the other way round.
