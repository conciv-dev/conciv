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
| phone-smoke       | sonnet | Automated half of the phone smoke gate ONLY: build the embed, run the `embed at a phone viewport` ITs, and report pass/fail per IT plus which of the four checks each one covers. Write the two missing ITs if they are still missing. It must NOT attempt the simulator half: a subagent cannot pause to ask the user, so that half belongs to the orchestrator.                                                                                                                                     |
| release-skeptic   | opus   | Adversarial: read `.github/workflows/release.yml`, `packages/publish/src/guards.ts`, the diff since main, and the other verifiers' outputs. Mission: PROVE THE RELEASE WILL FAIL. Any concrete failure path (permission missing on the reusable ci.yml call, `assertPublicSet` drift, unbootstrapped package, manifest missing `homepage`/`repository.directory`) is a blocking finding with the exact file and line.                                                                                 |

The release PR opens only when gates are green, both halves of the phone smoke gate are green, and the skeptic fails to construct a failure path. Report the skeptic's attempted attacks and why each failed; "skeptic found nothing" with no attack list is not evidence.

### Phone smoke gate (blocking)

0.0.16 shipped with every component check green and was broken on a real phone: the chat did not scroll, the panel sheet was transparent, and the composer overflowed its container. The package-level suites now cover sheet opacity at phone size but still not scrolling or a wrapped draft, so component-green is not release-green. This gate exists so that cannot recur.

Build the embed first, because both halves load the prebuilt bundle:

```
pnpm turbo run build --filter=@conciv/embed
```

The gate has two halves and different owners. The automated half runs inside the `phone-smoke` verifier during the fan-out. The simulator half CANNOT: a subagent cannot suspend the conversation to ask the user and wait, so a verifier that owned it would always return UNVERIFIED and the gate could never go green. The simulator half is therefore an orchestrator step in the main conversation, after the fan-out returns and before the release PR opens. Neither half alone clears the gate.

**Automated half (verifier, always run, no simulator needed).** What exists TODAY is the `embed at a phone viewport` describe block in `packages/embed/test/embed.it.test.ts`, three ITs against the built bundle:

- `paints an opaque sheet so the host page never shows through`: at 393x800 it opens the panel over fixture-owned striped backdrops (`?backdrop=light-stripes` and `?backdrop=dark-stripes`) and screenshots the sheet interior with `{animations: 'disabled', clip: SHEET_INTERIOR_CLIP}`. Inverting the backdrop must not change a single pixel, and a same-backdrop repeat is the determinism control. That check is COVERED.
- `opens as a full-screen sheet with the launcher hidden and the composer reachable`: at 393x800 the launcher disappears while the sheet is open, a message round-trips, and closing restores the launcher.
- `keeps Stop and Send inside the sheet on a narrow phone while a run streams`: at 320x800 Stop, Send, and Select model each stay fully inside the viewport (`toBeInViewport({ratio: 1})`).

Beyond opacity that is viewport-fit and open/close behavior only. Nothing asserts the transcript scrolls, and nothing exercises a wrapped multi-line draft, so a green run is not evidence for those two checks. Two named gaps must be WRITTEN as part of this release, in the same describe block:

- `scrolls the transcript to the latest turn on a phone`: a screenshot after a long turn showing the newest message at the bottom edge.
- `keeps a multi-line draft inside the composer on a phone`: a screenshot with a wrapped draft, proving no overflow past the sheet.

Assert both as screenshots, never `getBoundingClientRect` or `scrollHeight`, per the no-DOM-measurement rule. The opacity IT is the pattern to copy: clip a region, vary only the thing under test, and compare buffers.

**Simulator half (ORCHESTRATOR step, never a verifier).** WKWebView, the native bridge, and `pick` returning a real element only exist on-device. Run this in the main conversation once the fan-out has returned and before the release PR opens.

Prerequisite: the demo has no core of its own. `native/swift/ConcivDemo/run.sh` only builds, boots, installs, and launches `dev.conciv.ConcivDemo`; the app then discovers a core through `CONCIV_URL`, the pairing file `~/.conciv/dev-endpoint.json` that a running dev core writes on startup, or the 4599/8787/3000 port probe (`apps/site/content/docs/quick-start/ios.mdx`). So start the core FIRST:

```
pnpm --filter tanstack-start-example dev
```

That example's `vite.config.ts` pins the core to port 4599 and configures the `ios` extension against `native/swift/ConcivDemo`, so from the agent panel `ios.build` and `ios.run` build and launch the demo with `SIMCTL_CHILD_CONCIV_URL` already injected. `run.sh` is the equivalent by hand, and works only while that dev core is up. For a consumer app instead of the in-repo demo, follow the same doc (`ios.build` / `ios.run`, or `SIMCTL_CHILD_CONCIV_URL=http://127.0.0.1:4599 xcrun simctl launch booted dev.conciv.YourApp`).

Then the interaction problem: `simctl` can launch, screenshot (`io <udid> screenshot`), and stream logs (`spawn <udid> log stream`), but it CANNOT tap, type, or scroll. All four checks are interactive, so the listed commands alone cannot drive them. Two honest options, in order:

1. An XCUITest UI-test target driven headlessly by `xcodebuild test`. That is allowed: it drives its own simulator and never touches the user's mouse, and being non-interactive it could move into the `phone-smoke` verifier. No such target exists for ConcivDemo today (`native/swift/ConcivDemo` is a `swiftc` app build with no test target; only `native/swift/ConcivWidget/Tests` runs under `xcodebuild test`), so this option is unavailable until someone writes one.
2. Until then the four checks are a MANUAL step for the human doing the release. The orchestrator presents the four checks to the user as a list, waits for their report plus screenshots, and records each one against the artifact they returned. Never hand this to a subagent, and never drive the Simulator UI itself, by `osascript`, `cliclick`, or anything else.

If the user does not respond, or the machine has no Xcode simulator, the simulator checks are UNVERIFIED, which blocks the release the same way a failure does. Do not open the release PR on a green fan-out alone.

The four checks and where each one is verified:

| Check                              | Automated (verifier, embed ITs)                        | Simulator (orchestrator asks the user)                                            |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Chat transcript scrolls to the end | GAP: write the scroll screenshot IT                    | scroll the transcript after a long turn, screenshot the result                    |
| Panel sheet is opaque              | COVERED by `paints an opaque sheet ...`                | open the sheet over the demo's payments screen, screenshot it                     |
| Composer does not overflow         | partly: Stop/Send/Select model in-viewport at 320 wide | type a multi-line draft with the keyboard up, screenshot it                       |
| `pick` returns a real element      | not coverable in the browser                           | REQUIRED: pick a row in the demo, confirm the grab carries text, rect, and source |

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
- Handing the simulator half to a subagent: it cannot stop and ask the user, so it can only ever report UNVERIFIED.
