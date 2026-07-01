# Design: npm publishing for conciv (`@conciv/it` umbrella)

Date: 2026-07-02
Status: approved-pending-review

## Goal

Start publishing conciv to npm. End users run one install — `npm/pnpm add @conciv/it` —
and wire the plugin from a subpath (`@conciv/it/plugin/vite`, `/webpack`, `/nextjs`, …).
`@conciv/it` is the rename of today's `@conciv/qu`. Its `workspace:^` deps resolve to the
real published versions of the packages it needs, so the relevant packages publish as a
normal npm graph (NOT bundled into one artifact).

## Why not one self-contained bundle

Considered and rejected. The plugin injects literal import specifiers into a virtual module
that the **consumer's own bundler** resolves and compiles:

- `import {mountWidget} from '@conciv/widget'`
- each built-in extension's client entry (`@conciv/extension-whiteboard/client`, …)
- `import.meta.glob('/conciv/extensions/*.tsx')` — the user's own extensions

Widget + built-in extensions + user extensions must live in ONE bundler graph at the
consumer's build so Solid and the `@conciv/extension` runtime dedupe to a single copy
(the recurring "useExtensionRuntimeContext outside provider" / duplicate-context class of
bugs). Bundling shared leaves into multiple packages reintroduces duplicate copies. So the
packages stay externalized and publish individually; `@conciv/it` is the thin umbrella.

## Rename: `@conciv/qu` → `@conciv/it`

- npm name `@conciv/qu` → `@conciv/it`.
- Move directory `packages/conciv/` → `packages/it/`.
- Update in the moved package: `name`, `repository.directory`, `homepage`, `bugs`,
  `description`, README, dist self-references.
- Update references elsewhere:
  - `packages/plugin/src/core/extensions.ts` comments ("`@conciv/qu` supplies the built-ins").
  - Any `workspace:` dependency on `@conciv/qu` (e.g. plugin, example apps) → `@conciv/it`.
  - `conciv-publish` / turbo filters if they name the package.
- Consumer surface after rename:
  ```ts
  // vite.config.ts
  import conciv from '@conciv/it/plugin/vite'
  export default {plugins: [conciv()]}
  ```
- Grep gate: `git grep -n "@conciv/qu"` and `git grep -n "packages/conciv"` return 0.

## Public / private matrix (the trim)

Audit method: a package must be **public** iff its specifier is resolved in the consumer's
`node_modules` — either the umbrella imports it, or a browser-graph package keeps it
external. Verified by scanning each built `dist/` for remaining `@conciv/*` externals. Every
package in `@conciv/it`'s runtime closure stays externalized at every level, so the graph is
irreducible under the current (correct) dedup model.

**Public (18):**
it, plugin, cli, core, harness, protocol, api-client, grab, tools, extension, widget,
solid-diffs, solid-streamdown, ui-kit-system, ui-kit-chat, ui-kit-chat-tools, ui-kit-tap,
extension-test-runner, extension-whiteboard.

**Private (build/dev-only — add `"private": true`):**

- `uno-preset` — a build preset; nothing in the runtime graph imports it.
- `extension-testkit`, `publish` — already private.

**Remove / privatize:**

- `packages/tool-ui/` — orphan directory with **no `package.json`**. Its CSS was folded into
  the widget already. Delete it (or gate it) and remove the stale reference below.

## Pre-publish blockers (found during the audit — must fix first)

1. `packages/widget/src/styles.css` imports `@conciv/tool-ui/tokens.css`, but no
   `@conciv/tool-ui` package exists → would not resolve for a consumer. Repoint to the
   widget's own tokens (or the correct kit package) and confirm the widget builds.
2. Confirm the `@conciv/extensions` (plural) references seen in `core`/`plugin` dist are the
   `virtual:conciv-extensions` module id only, not a real unresolvable dependency.
3. Per public package, verify publish hygiene:
   - `files` field ships `dist` only (no `src`, no `node_modules`).
   - `exports` map complete and correct; `types` present; `publishConfig.access = "public"`.
   - `README.md` + `LICENSE` present (LICENSE may be a workspace symlink — ensure it packs).
   - No `workspace:*`/`workspace:^` leaks into the published manifest (changesets rewrites
     these at `version` time to the concrete published range — verify in a dry pack).
   - `publint` and `attw --profile esm-only` clean.
4. Whole-graph resolution smoke test: `changeset publish --dry-run` / `npm pack` each public
   package and confirm no dangling `@conciv/*` specifier points at a private/nonexistent pkg.

## Versioning: Epoch SemVer (antfu), starting `0.0.1`

Encoding stays 3-part semver so npm ranges and changesets work unchanged:

```
{EPOCH * 1000 + MAJOR}.MINOR.PATCH      (multiplier 1000)
```

- EPOCH — groundbreaking / new-era release; first number jumps to the next 1000. Rare.
- MAJOR — technical breaking change (0–999); first number +1.
- MINOR — backward-compatible feature.
- PATCH — backward-compatible fix.

Day-to-day, changesets `patch|minor|major` map directly to the last-three-concepts bumps.
An EPOCH bump is not a changeset type — it is a manual/one-off version set the rare time an
era changes; `conciv-publish` can grow a helper for it later. No custom versioning engine now.

- First published version for the whole fixed group: **`0.0.1`** (epoch 0, pre-release; matches
  the "v0: break API freely" stance). Noted trade-off: Epoch SemVer's own guidance prefers
  leaving zero-major, but `0.0.1` is valid and chosen deliberately for the soft launch.
- Changesets already has `fixed: [["@conciv/*"]]` — all public packages share one version and
  bump together. Private packages are ignored by changesets automatically.

## Release mechanism: GitHub Action + provenance

- Add a `.github/workflows/release.yml` using `changesets/action`:
  - On push to `main`: if changesets are pending, open/refresh a "Version Packages" PR
    (runs `conciv-publish version`).
  - When that PR merges: run `conciv-publish release` (build + publint + attw + `changeset
publish`) publishing with **npm provenance** (`--provenance`, `id-token: write`).
- Requirements:
  - `NPM_TOKEN` (automation token, publish scope for `@conciv`) as a repo secret.
  - The `@conciv` npm org/scope exists and the token can publish to it; `access: public`.
  - Provenance requires publishing from the GitHub Action (OIDC), Node ≥ 18, npm ≥ 9.4.
- Matches the workspace's supply-chain hardening posture (minimumReleaseAge, allowBuilds).

## Rollout order

1. Fix pre-publish blockers (widget tokens ref, verify virtual ids).
2. Rename qu → it (name + dir + references); build green; grep gate = 0.
3. Apply public/private matrix; delete/privatize `tool-ui`; `uno-preset` private.
4. Publish-hygiene pass per public package (files/exports/README/LICENSE/publint/attw).
5. Whole-graph dry pack + resolution smoke test.
6. Add release GitHub Action + provenance; set `NPM_TOKEN`; confirm `@conciv` scope access.
7. Create the first changeset (patch) → group at `0.0.1`; open Version PR; merge → first publish.
8. Post-publish: `npm install @conciv/it` in a scratch app; wire `@conciv/it/plugin/vite`;
   confirm widget + built-in extensions load and the whole `@conciv/*` graph resolves.

## Out of scope

- Any change to the runtime dedup / injection architecture.
- Bundling packages together.
- A custom CalVer/timestamp version engine.
- Publishing example apps or `extension-testkit`/`publish` tooling.
