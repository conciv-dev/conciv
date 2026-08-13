# Worked example: issue #316 → PR #468

Facts below are verified against the live issue/PR (`gh issue view 316`, `gh pr view 468`) at
write time, not reconstructed from memory. Use this as the shape a real lane takes, including the
parts that don't fit on the happy path.

## Pick

#316 carried `ready-for-agent` and `ci`. The body was already groomed: a failing `Release`
workflow run, a two-commit root cause table (`e93318a3` reverted the CLI package name, `83272f77`
added a changeset still naming the old one), and three ranked suggested fixes with an explicit
caveat on option 1 (`changeset status` has zero-changeset exit-code quirks). This is exactly the
shape Step 0's pick order rewards — smallest pre-groomed issue, grab it.

## Groom-verify

Grooming still re-checked the issue's claims against current `origin/main` rather than trusting
the body verbatim: confirmed `packages/cli/package.json` was in fact `@conciv/cli`, confirmed no
workspace package named bare `conciv` existed, and confirmed `ci.yml`'s `repo-checks` job really
had no `changeset` invocation anywhere (`grep -rn changeset .github/workflows/*.yml` turned up only
`release.yml`). The issue picked option 2 (a targeted `conciv-publish` guard, shaped like the
existing `assertPublicSet` drift guard) over option 1 for the reason the body itself gave.

## Dispatch

Decided shape handed to the agent: build `assertChangesetsResolve` in `packages/publish/src/guards.ts`,
same shape as `assertPublicSet`; expose it as `conciv-publish check-changesets`; call it at the
start of `conciv-publish version` so the release job fails fast with a readable message instead of
changesets' raw stack trace; wire it into `repo-checks` in `ci.yml`. That single ruling (guard, not
`changeset status`) meant the agent never had to re-litigate the issue's own trade-off analysis.

## Review rounds

The PR went through multiple hardening passes before it was mergeable, each catching something the
previous pass missed — this is the part of the lane that Step 3 ("review the full diff yourself,
judge mechanism not just correctness") exists for:

- Early rounds tightened the trust model of `conciv-publish` itself: deleted an upward
  directory-walk `findRoot` in favor of an explicit `assertWorkspaceRoot` guard, closed several
  fail-open branches in manifest/changeset reading into fail-closed ones (malformed manifest,
  symlinked changeset file, duplicate package entry), and swapped a hand-rolled frontmatter regex
  for `@changesets/parse` — the same library `changeset version` itself uses — so the guard accepts
  exactly what the real release step accepts.
- A dedicated **codex + adversarial review round** on the PR (documented in the PR body under "Fix
  wave") found several issues that would have shipped a gate that looked green but did nothing
  real: **H1**, the coverage check counted every `.changeset/*.md` file present in the directory at
  HEAD, not just the ones the PR itself added — so a changeset already committed at the merge base
  silently satisfied coverage for an unrelated PR, making the gate vacuous. **H2**, a live CI-red
  bug: the hand-rolled `packages/` + `packages/extensions/` directory scan used to enumerate
  workspace packages was blind to `apps/*`, so a real changeset naming `@conciv/app` failed
  name-validation on an actual PR. **H3**, a zizmor-flagged unsound Actions ternary:
  `fetch-depth: ${{ github.event_name == 'pull_request' && 0 || 1 }}` always evaluated to `1`
  because `0` is falsy in GitHub Actions expressions, silently defeating the intended
  full-history checkout on PR runs. Fixes: PR-added-only coverage counting (`git diff --name-status`
  scoped to `Added` files), a pleb-ported generator tree walk over `pnpm-workspace.yaml`'s real
  glob list replacing the hand-rolled scan, and removing the ternary entirely once the coverage
  step moved to its own always-full-history workflow.

## The RCA

Even after that hardening landed, the PR's own CI run produced a false positive: `check-changesets
--require-coverage` reported every published package as touched, when the PR's actual diff only
touched `packages/publish` (private), workflow files, and the lockfile. The RCA phase evaluated two
suspects — a bug in the new dependency-attribution logic (H4), and a root-package inversion in the
workspace walk — and refuted both with evidence before accepting either. The real mechanism:
`pull_request`'s default `actions/checkout` ref is the _ephemeral merge_ of the PR head into
whatever `main` currently is, not the PR branch alone, while `--base` was pinned to a base-SHA
snapshot taken when the event fired. Between that snapshot and the job actually running, an
unrelated `chore: version packages` PR landed on main and bumped every package's manifest and
changelog — a real diff, just not this PR's diff. Confirmed locally by reproducing the exact
`git diff --name-status --no-renames <stale-base>...<merge-ref>` and seeing the unrelated release
bump appear. Fix: pin the checkout to `ref: ${{ github.event.pull_request.head.sha }}` so both
sides of the diff are fixed commits, immune to whatever lands on main afterward.

## Lessons

- Verify claims against the actual consumer's own libraries, not an assumption about how they
  behave — `@changesets/parse` for parsing, real `pnpm-workspace.yaml` glob semantics (via a
  faithful port of pleb's resolver, plus a parity test against `pnpm ls -r --depth -1 --json`) for
  workspace enumeration.
- Fail closed everywhere a guard has a choice between silently tolerating and throwing — a fail-open
  branch in security- or release-critical code is a bug waiting for the one input that exercises it.
- Every new dependency in this PR (`minimatch`, `js-yaml`, later `@manypkg/get-packages` and then
  its removal in favor of the pleb port) was verbatim-approved by the repo owner before landing —
  none were inferred.

## Checkpoint list for a future lane

1. Pick order respected; issue re-verified against current main, not trusted as written.
2. Dispatch states a decided shape, not an open design question.
3. Full diff reviewed by the orchestrator before hand-off, not just "tests pass."
4. Where a gate's own correctness matters (CI/release code), prove it fails on the bad input, not
   just that it passes on the good one — a coverage gate that never goes red on a real miss is not
   verified.
5. A false-positive or a flaky-looking gate result gets a real RCA (competing suspects, evidence,
   refutation) before a fix — never patched on a hunch.
6. Every new dependency has explicit owner approval on record.
