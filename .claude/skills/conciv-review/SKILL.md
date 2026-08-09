---
name: conciv-review
description: Use when reviewing code in the conciv monorepo, before merging a PR, after implementing a feature, or when asked to review a diff or branch. Orchestrates a multi-agent review (parallel expert reviewers plus adversarial verification) over the repo's hard style rules, test conventions, fallow audit, and architecture landmines.
---

# Reviewing conciv code

## Overview

A conciv review is a multi-agent process, not a single read-through. Independent expert reviewers fan out in parallel, each wearing exactly one hat; skeptic agents then try to REFUTE every finding; only confirmed findings are reported. Generic review instincts (add comments, add back-compat shims, mock heavy deps) are mostly WRONG here; the review laws in `.github/skills/code-review/SKILL.md` are what govern.

Solo single-pass review is acceptable only for a trivial mechanical diff (a rename, a version bump, under ~20 lines with no logic). Everything else runs the orchestration.

## Step 0: scope and gates (inline, before any agents)

1. Scope the diff: `git diff --stat main...HEAD` and collect the changed packages.
2. Load package skills for every touched package:

   ```bash
   pnpm dlx @tanstack/intent@latest list
   pnpm dlx @tanstack/intent@latest load <package>#<skill>
   ```

   (e.g. `@tanstack/ai` for harness/adapter changes, `@tanstack/db` for whiteboard collections, `fallow` for audit questions.)

3. Run the gates. A gate failure is itself a blocking finding; do not wait for agents to rediscover it.

| Gate         | Command                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck    | `pnpm typecheck`                                                                                                                                 |
| Build        | `pnpm build`                                                                                                                                     |
| Tests        | `pnpm test`, then `pnpm exec turbo run test --filter=<pkg-name> --force` per changed package (package name, e.g. `--filter=@conciv/ui-kit-chat`) |
| Lint         | `pnpm lint`                                                                                                                                      |
| Format       | `pnpm format:check`                                                                                                                              |
| Fallow audit | `pnpm exec fallow audit --changed-since main --format json`                                                                                      |

Turbo caches test results; a cached green is a claim about old inputs, not current behavior. Final verdicts and any "fails in CI, passes locally" investigation require the `--force` reruns.

## Step 1: mixture of experts (parallel fan-out)

Launch ALL applicable experts concurrently (one message, multiple Agent calls). Models are tiered per hat: the architect (whole-system reasoning across package boundaries) runs `fable`, other deep-reasoning hats run `opus`, mechanical checklist hats run `sonnet`; never let a subagent silently inherit the session model. Every expert is read-only: it reads the full changed files (not just hunks) plus whatever context it needs, and returns structured findings only; it fixes nothing. Each expert prompt contains: the changed-file list, its single hat description plus the sections it owns from `.github/skills/code-review/SKILL.md`, and the required output shape: `{file, line, severity, claim, evidence, failure_scenario}` per finding, where `severity` is `'blocking' | 'minor'`.

| Hat              | Model  | Mission                                                                                                                                                             |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bug-hunter       | opus   | Correctness only: logic errors, edge cases, races, broken invariants. Every finding needs a concrete failure scenario (inputs/state leading to wrong output).       |
| style-enforcer   | sonnet | The "Code laws" and "SolidJS" sections of the shared skill, nothing else. Every violation is blocking.                                                              |
| test-engineer    | sonnet | The shared skill's "Testing" section plus coverage: does the diff change behavior that no test exercises?                                                           |
| architect        | fable  | The shared skill's "Architecture", "Whiteboard landmine", "Widget bundle" and "TanStack Router" sections plus package-boundary and dependency-direction violations. |
| security-auditor | opus   | The shared skill's "Boundaries and security" section: gate conservatism, localhost binding, secrets, zod on untrusted input, injection surfaces.                    |
| simplifier       | sonnet | Fallow findings (INTRODUCED dead code, unused exports/deps, duplication, complexity, circular deps) plus needless abstraction the diff adds.                        |

Skip a hat only when it plainly cannot apply (e.g. no security surface touched). When the harness exposes specialized agent types (`code-reviewer`, `security-auditor`, `test-engineer`), map hats onto them; otherwise use general-purpose agents with the hat prompt.

When the Workflow tool is available, prefer it over hand-rolled Agent calls; this skill's instruction counts as the explicit opt-in. Skeleton:

```js
export const meta = {
  name: 'conciv-review',
  description: 'Expert fan-out review with adversarial verification',
  phases: [{title: 'Review'}, {title: 'Verify'}],
}
const results = await pipeline(
  HATS,
  (hat) => agent(hat.prompt, {label: `review:${hat.key}`, phase: 'Review', model: hat.model, schema: FINDINGS}),
  (review) => parallel(review.findings.map((f) => () => verify(f))),
)
function verify(f) {
  if (f.severity !== 'blocking') {
    return agent(refutePrompt(f), {phase: 'Verify', model: 'sonnet', schema: VERDICT}).then((v) => ({...f, verdict: v}))
  }
  const lenses = ['correctness', 'does-it-reproduce', 'is-it-preexisting-on-main']
  return parallel(
    lenses.map((lens) => () => agent(refutePrompt(f, lens), {phase: 'Verify', model: 'opus', schema: VERDICT})),
  ).then((votes) => ({...f, verdict: {stands: votes.filter(Boolean).filter((v) => v.stands).length >= 2}}))
}
return {
  confirmed: results
    .flat()
    .filter(Boolean)
    .filter((f) => f.verdict?.stands),
}
```

`pipeline` (no barrier) so each hat's findings go to verification while other hats still review.

## Step 2: adversarial verification

No finding reaches the user unverified. For each finding, spawn a skeptic agent whose entire job is to REFUTE it with code evidence: "Read the code. Prove this finding wrong. Default to refuted when the evidence is inconclusive." Minor findings get one `sonnet` skeptic. Blocking-severity findings get three `opus` skeptics with distinct lenses (correctness, does-it-reproduce, is-it-preexisting-on-main) and a majority to uphold. Refuted findings die silently; a plausible-sounding-but-wrong finding is worse than a missed one.

The style-enforcer hat is the exception: hard-rule violations (a comment, an `any`, an `else`, a class) are mechanical facts; verify by reading the line, not by panel.

## Step 3: synthesis

Dedupe confirmed findings by file+line, rank blocking first, and report each with its `file:line`, the claim, and the concrete failure scenario or rule citation. Gate failures from Step 0 lead the report. State plainly when nothing survived verification.

---

## Expert checklists

The review laws are NOT restated here. They live in one shared source:
`.github/skills/code-review/SKILL.md`, which the GitHub Copilot reviewer reads too. Read that file
before Step 1 and paste the sections a hat owns straight into that hat's prompt: "Code laws" and
"SolidJS" for the style-enforcer, "Testing" for the test-engineer, "Architecture", "Whiteboard
landmine", "Widget bundle" and "TanStack Router" for the architect, "Boundaries and security" for
the security-auditor, "Fallow" for the simplifier, "Tone" and "Process" for every hat. A second copy
of a rule drifts from the first, so a reviewer law that is missing gets ADDED to the shared file,
never added here.

## Common reviewer mistakes

| Mistake                                          | Reality                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| "This complex function needs a comment"          | No. It needs a better name or decomposition; lint deletes the comment anyway.                                    |
| "Cached `pnpm test` was green, ship it"          | Turbo can replay stale greens. Force-run changed packages.                                                       |
| "This export is unused, delete it"               | Trace it first; public package exports are API.                                                                  |
| "Mock the harness/CLI for this test"             | Testkits share real plumbing; mocks of internals are rejected.                                                   |
| "Keep the old signature for safety"              | v0. Break it, update call sites.                                                                                 |
| "Example app is the natural place for this test" | Never. Owning package or e2e consumer app.                                                                       |
| "One careful read-through is enough"             | Only for trivial mechanical diffs. Otherwise run the fan-out; a solo pass has one blind spot per hat it skipped. |
| "The finding sounds right, report it"            | Unverified findings don't ship. Skeptics first.                                                                  |
