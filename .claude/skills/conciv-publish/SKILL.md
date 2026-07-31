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

2. **Merge to main.** `changesets/action` opens a `chore: version packages` PR that runs `pnpm release:version` (consumes changesets, bumps versions + CHANGELOGs, resyncs the lockfile). This version PR usually gets NO CI (bot-token pushes don't trigger `pull_request` workflows — its green checkmarks are CodeQL and cache-cleanup, not tests), though a Release run RE-RUN by a human leaks that human as `triggering_actor` and the PR does get CI. Either way is fine: main was already validated at step 1's merge.

3. **Merge the version PR.** CI runs `pnpm release`: `turbo run build publint attw`, then `changeset publish` to npm with provenance, and pushes git tags. Landmine (2026-07-19): the squash-merge push event can be silently swallowed and NO Release run is created — zero runs for the merge SHA, nothing to debug in the workflow. Recovery: any human push to main (e.g. an empty `chore: trigger release` commit) starts a run that publishes everything still unpublished.

## Pre-release verification (multi-agent)

Before opening the release PR, fan out verifier agents concurrently (one message, multiple Agent calls; the Workflow tool is preferred when available, exactly as in the `conciv-review` skill, and this skill's instruction is the explicit opt-in). Models are tiered: mechanical checks run `haiku` or `sonnet`, the adversarial skeptic runs `opus`; never let a subagent silently inherit the session model. Each verifier returns structured results, not prose. The mechanical verifiers report command output and registry facts, which need no adversarial pass; judgment lives solely in the release-skeptic.

`<v>` in the npm-auditor recipe is the latest published version on the current fixed line (all `@conciv/*` share one version; read it from any public package's `package.json`).

| Verifier          | Model  | Mission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gates-runner      | sonnet | Run `pnpm typecheck && pnpm build && pnpm test`, forced test reruns for changed packages, `pnpm lint`, `pnpm format:check`, `pnpm exec fallow audit --changed-since main --format json`, and `pnpm release:check`. Report raw pass/fail per command with the failing output verbatim. Anything INTRODUCED by fallow blocks.                                                                                                                                                                           |
| changeset-auditor | haiku  | Verify `.changeset/*.md` exists for the work being released, frontmatter parses, exactly the fixed-versioning shape (one `@conciv/*` entry, no enumeration), and the description reads from the consumer's perspective.                                                                                                                                                                                                                                                                               |
| npm-auditor       | haiku  | For each package in `PUBLIC_PACKAGES` (`packages/publish/src/guards.ts`), query the registry: `curl -s https://registry.npmjs.org/@conciv%2f<pkg> \| jq '.versions["<v>"]._npmUser, .versions["<v>"].dist.attestations'`. `_npmUser` "GitHub Actions" plus attestations means trusted publishing is configured; a human `_npmUser` and null attestations means the package will E404 the next CI release. Also flag any `PUBLIC_PACKAGES` entry missing from the registry entirely (needs bootstrap). |
| phone-smoke       | sonnet | Run the phone smoke gate below. Report each of the four checks as pass/fail with the artifact that proves it (screenshot path, IT name, or simulator log line), plus which half of the gate ran (automated ITs, simulator, or both).                                                                                                                                                                                                                                                                  |
| release-skeptic   | opus   | Adversarial: read `.github/workflows/release.yml`, `packages/publish/src/guards.ts`, the diff since main, and the other verifiers' outputs. Mission: PROVE THE RELEASE WILL FAIL. Any concrete failure path (permission missing on the reusable ci.yml call, `assertPublicSet` drift, unbootstrapped package, manifest missing `homepage`/`repository.directory`) is a blocking finding with the exact file and line.                                                                                 |

The release PR opens only when gates are green, the phone smoke gate is green, and the skeptic fails to construct a failure path. Report the skeptic's attempted attacks and why each failed; "skeptic found nothing" with no attack list is not evidence.

### Phone smoke gate (blocking)

0.0.16 shipped with every component check green and was broken on a real phone: the chat did not scroll, the panel sheet was transparent, and the composer overflowed its container. Nothing in the package-level suites looks at the widget at phone size, so component-green is not release-green. This gate exists so that cannot recur.

Build the embed first, because both halves load the prebuilt bundle:

```
pnpm turbo run build --filter=@conciv/embed
```

Then run both halves. Neither half alone clears the gate.

**Automated half (always run, no simulator needed).** The phone-viewport Playwright ITs in `packages/embed/test/*.it.test.ts` open the built bundle with `browser.newPage({viewport: {width: 390, height: 844}})` and cover scrolling, sheet opacity, and composer layout as screenshots (never `getBoundingClientRect`, per the no-DOM-measurement rule). If a check has no phone-viewport IT yet, writing it is part of the release, not a follow-up.

**Simulator half (needed for anything the browser cannot model).** WKWebView, the native bridge, and `pick` returning a real element only exist on-device. Run the demo headlessly and never drive the user's mouse or the Simulator UI:

```
SIM_NAME="iPhone 17 Pro" native/swift/ConcivDemo/run.sh
```

`run.sh` builds, boots the simulator, installs, and launches `dev.conciv.ConcivDemo`. For a consumer app instead of the in-repo demo, use the documented external flow in `apps/site/content/docs/quick-start/ios.mdx` (`ios.build` and `ios.run`, or `SIMCTL_CHILD_CONCIV_URL=http://127.0.0.1:4599 xcrun simctl launch booted dev.conciv.YourApp`). Drive the rest with `xcrun simctl` only (`launch`, `io <udid> screenshot`, `spawn <udid> log stream`); the `open -a Simulator` line is convenience, not permission to click. On a machine with no Xcode simulator, say so in the verifier report and treat the simulator checks as UNVERIFIED, which blocks the release the same way a failure does.

The four checks, each needing an artifact:

| Check                              | Automated proxy                            | Simulator                                                                         |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Chat transcript scrolls to the end | phone-viewport IT, screenshot after scroll | screenshot after a long turn, taken with `simctl io screenshot`                   |
| Panel sheet is opaque              | phone-viewport IT screenshot               | screenshot over a busy host screen                                                |
| Composer does not overflow         | phone-viewport IT screenshot               | screenshot with a multi-line draft and the keyboard up                            |
| `pick` returns a real element      | not coverable in the browser               | REQUIRED: pick a row in the demo, confirm the grab carries text, rect, and source |

`pick` has no browser proxy: the bridge is native, so a green IT run says nothing about it. A release that skipped the simulator has not verified `pick`.

## Adding a new published package

A new package with `private` unset/false needs, in the PR:

- Its name added to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`, or `assertPublicSet` aborts the release on drift.
- `homepage: https://conciv.dev` and a `repository` block with its `directory`, matching every other public manifest.

Then the one-time first publish, because npm trusted publishing CANNOT create a new package ("Package must exist" is a hard registry prerequisite, and `npm trust` needs the human's 2FA session — credentials CI must never hold). After the version PR for the new package has merged (so its manifest carries a real version), a human with npm auth runs ONE argument-less, idempotent command:

```
pnpm release:sync
```

`conciv-publish sync` (packages/publish/src/cli.ts) reconciles npm with `PUBLIC_PACKAGES`: for every listed package it reads the registry state (`missing` / `untrusted` / `trusted`, decided by whether the latest version carries `_npmUser.trustedPublisher`), first-publishes anything missing (`--access public --no-git-checks`), wires the trusted publisher for anything untrusted via `npx npm@^11.15.0 trust github <pkg> --repo conciv-dev/conciv --file release.yml --allow-publish` (no `--environment`, matching the existing packages; skipped when `npm trust list` already shows a config), then runs `changeset tag` and pushes tags. When everything is healthy it prints "nothing to do" and exits — safe to run anytime.

Until the trust config exists, every CI release fails that package with `E404 undefined - PUT`. The sync first-publish has no provenance; the next CI publish restores it.

## Debugging a failed Release run

| Symptom                                                            | Cause / fix                                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E404 undefined - PUT @conciv/<pkg>` in CI                         | Package missing from npm or has no trusted-publisher config. Run `pnpm release:sync`; confirm with `npx npm@^11.15.0 trust list <pkg>` or the npm-auditor curl recipe. |
| Release run failed after versions merged                           | npm may sit one version behind main. The next successful run publishes every still-unpublished package; fix the failure, don't re-version.                             |
| Versions on npm but no git tags                                    | A manual publish happened (changesets only tags what IT publishes). Recover: `pnpm changeset tag && git push --tags`.                                                  |
| Version on npm without provenance                                  | It was published manually. Expected for bootstraps; the next CI publish restores provenance.                                                                           |
| Whole Release workflow fails at startup ("Error calling workflow") | The reusable ci.yml call is missing a permission its jobs need; grant it on the `test` job in release.yml.                                                             |
| `assertPublicSet` aborts                                           | `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts` drifted from the actual public manifests. Sync the list.                                                         |

## Red flags

- Running `pnpm release` or `release:version` locally (except the documented bootstrap publish).
- A changeset listing many `@conciv/*` packages: fixed versioning makes one entry enough.
- Treating the version PR's missing CI as a blocker, or a green version PR as test evidence.
- Publishing manually to "unblock" a red Release run instead of fixing it: you lose provenance and tags.
- Skipping the verifier fan-out because "the gates passed last week": registry and workflow state drift independently of the code.
- Treating component-green CI as phone-green, or shipping with the simulator half of the phone smoke gate unrun: that is exactly how 0.0.16 shipped broken.
