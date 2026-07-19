---
name: conciv-publish
description: Use when releasing @conciv packages to npm, adding a changeset, cutting a version, adding a new published package, or debugging a failed Release workflow run (E404, missing provenance, missing git tags, version PR with no CI). Runs a multi-agent pre-release verification with an adversarial release skeptic.
---

# Publishing @conciv packages

## Iron rule: publishing is CI-only

Releases go through OIDC trusted publishing in `.github/workflows/release.yml` (`changesets/action`, `id-token: write`, `NPM_TOKEN` empty). There is NO npm token for humans. `pnpm release` from a laptop fails with `E404` on the registry PUT. Never run `pnpm release` or `pnpm release:version` locally; those are CI steps.

The single exception is the first-publish bootstrap for a brand-new package (below).

## The flow, end to end

1. **Land a PR with a changeset.** `pnpm changeset`, or hand-write `.changeset/<name>.md`:

   ```markdown
   ---
   '@conciv/core': patch
   ---

   Describe the change from the consumer's perspective.
   ```

   All `@conciv/*` packages are version-fixed (`.changeset/config.json` `fixed: [["@conciv/*"]]`, currently the 0.0.x patch line). One entry naming ANY `@conciv/*` package bumps and releases the whole set in lockstep; do not enumerate packages.

2. **Merge to main.** `changesets/action` opens a `chore: version packages` PR that runs `pnpm release:version` (consumes changesets, bumps versions + CHANGELOGs, resyncs the lockfile). This version PR gets NO CI (bot-token pushes don't trigger `pull_request` workflows); its green checkmarks are CodeQL and cache-cleanup, not tests. Main was already validated at step 1's merge, so this is expected, not broken.

3. **Merge the version PR.** CI runs `pnpm release`: `turbo run build publint attw`, then `changeset publish` to npm with provenance, and pushes git tags.

## Pre-release verification (multi-agent)

Before opening the release PR, fan out verifier agents concurrently (one message, multiple Agent calls; the Workflow tool is preferred when available, exactly as in the `conciv-review` skill, and this skill's instruction is the explicit opt-in). Models are tiered: mechanical checks run `haiku` or `sonnet`, the adversarial skeptic runs `opus`; never let a subagent silently inherit the session model. Each verifier returns structured results, not prose. The mechanical verifiers report command output and registry facts, which need no adversarial pass; judgment lives solely in the release-skeptic.

`<v>` in the npm-auditor recipe is the latest published version on the current fixed line (all `@conciv/*` share one version; read it from any public package's `package.json`).

| Verifier          | Model  | Mission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gates-runner      | sonnet | Run `pnpm typecheck && pnpm build && pnpm test`, forced test reruns for changed packages, `pnpm lint`, `pnpm format:check`, `pnpm exec fallow audit --changed-since main --format json`, and `pnpm release:check`. Report raw pass/fail per command with the failing output verbatim. Anything INTRODUCED by fallow blocks.                                                                                                                                                                           |
| changeset-auditor | haiku  | Verify `.changeset/*.md` exists for the work being released, frontmatter parses, exactly the fixed-versioning shape (one `@conciv/*` entry, no enumeration), and the description reads from the consumer's perspective.                                                                                                                                                                                                                                                                               |
| npm-auditor       | haiku  | For each package in `PUBLIC_PACKAGES` (`packages/publish/src/guards.ts`), query the registry: `curl -s https://registry.npmjs.org/@conciv%2f<pkg> \| jq '.versions["<v>"]._npmUser, .versions["<v>"].dist.attestations'`. `_npmUser` "GitHub Actions" plus attestations means trusted publishing is configured; a human `_npmUser` and null attestations means the package will E404 the next CI release. Also flag any `PUBLIC_PACKAGES` entry missing from the registry entirely (needs bootstrap). |
| release-skeptic   | opus   | Adversarial: read `.github/workflows/release.yml`, `packages/publish/src/guards.ts`, the diff since main, and the other verifiers' outputs. Mission: PROVE THE RELEASE WILL FAIL. Any concrete failure path (permission missing on the reusable ci.yml call, `assertPublicSet` drift, unbootstrapped package, manifest missing `homepage`/`repository.directory`) is a blocking finding with the exact file and line.                                                                                 |

The release PR opens only when gates are green and the skeptic fails to construct a failure path. Report the skeptic's attempted attacks and why each failed; "skeptic found nothing" with no attack list is not evidence.

## Adding a new published package

A new package with `private` unset/false needs, in the PR:

- Its name added to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`, or `assertPublicSet` aborts the release on drift.
- `homepage: https://conciv.dev` and a `repository` block with its `directory`, matching every other public manifest.

Then the one-time npm bootstrap, because OIDC trusted publishing CANNOT create a new package (the trusted-publisher setting lives in per-package npmjs settings, which only exist after the package exists):

1. A human with npm auth publishes the first version manually:
   `pnpm exec turbo run build --filter=<pkg>` then `pnpm --filter <pkg> publish --access public --no-git-checks`
2. In that package's npmjs settings, add the trusted publisher: org `conciv-dev`, repo `conciv`, workflow `release.yml`, no environment.

Until step 2 is done, every CI release fails that package with `E404 undefined - PUT`.

## Debugging a failed Release run

| Symptom                                                            | Cause / fix                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `E404 undefined - PUT @conciv/<pkg>` in CI                         | Package has no trusted-publisher config on npmjs. Add it (settings above); confirm with the npm-auditor curl recipe.                       |
| Release run failed after versions merged                           | npm may sit one version behind main. The next successful run publishes every still-unpublished package; fix the failure, don't re-version. |
| Versions on npm but no git tags                                    | A manual publish happened (changesets only tags what IT publishes). Recover: `pnpm changeset tag && git push --tags`.                      |
| Version on npm without provenance                                  | It was published manually. Expected for bootstraps; the next CI publish restores provenance.                                               |
| Whole Release workflow fails at startup ("Error calling workflow") | The reusable ci.yml call is missing a permission its jobs need; grant it on the `test` job in release.yml.                                 |
| `assertPublicSet` aborts                                           | `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts` drifted from the actual public manifests. Sync the list.                             |

## Red flags

- Running `pnpm release` or `release:version` locally (except the documented bootstrap publish).
- A changeset listing many `@conciv/*` packages: fixed versioning makes one entry enough.
- Treating the version PR's missing CI as a blocker, or a green version PR as test evidence.
- Publishing manually to "unblock" a red Release run instead of fixing it: you lose provenance and tags.
- Skipping the verifier fan-out because "the gates passed last week": registry and workflow state drift independently of the code.
