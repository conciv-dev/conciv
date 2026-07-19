---
name: conciv-review
description: Use when reviewing code in the conciv monorepo, before merging a PR, after implementing a feature, or when asked to review a diff or branch. Orchestrates a multi-agent review (parallel expert reviewers plus adversarial verification) over the repo's hard style rules, test conventions, fallow audit, and architecture landmines.
---

# Reviewing conciv code

## Overview

A conciv review is a multi-agent process, not a single read-through. Independent expert reviewers fan out in parallel, each wearing exactly one hat; skeptic agents then try to REFUTE every finding; only confirmed findings are reported. Generic review instincts (add comments, add back-compat shims, mock heavy deps) are mostly WRONG here; the expert checklists below are the law.

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

Launch ALL applicable experts concurrently (one message, multiple Agent calls). Models are tiered per hat: deep-reasoning hats run `opus`, mechanical checklist hats run `sonnet`; never let a subagent silently inherit the session model. Every expert is read-only: it reads the full changed files (not just hunks) plus whatever context it needs, and returns structured findings only; it fixes nothing. Each expert prompt contains: the changed-file list, its single hat description and checklist from this skill, and the required output shape: `{file, line, severity, claim, evidence, failure_scenario}` per finding, where `severity` is `'blocking' | 'minor'`.

| Hat              | Model  | Mission                                                                                                                                                       |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bug-hunter       | opus   | Correctness only: logic errors, edge cases, races, broken invariants. Every finding needs a concrete failure scenario (inputs/state leading to wrong output). |
| style-enforcer   | sonnet | The "Hard style rules" checklist, nothing else. Every violation is blocking.                                                                                  |
| test-engineer    | sonnet | The "Test review" checklist plus coverage: does the diff change behavior that no test exercises?                                                              |
| architect        | opus   | The "Architecture landmines" checklist plus package-boundary and dependency-direction violations.                                                             |
| security-auditor | opus   | The "Security" checklist: permission-gate conservatism, localhost binding, secrets, zod at HTTP boundaries, injection surfaces.                               |
| simplifier       | sonnet | Fallow findings (INTRODUCED dead code, unused exports/deps, duplication, complexity, circular deps) plus needless abstraction the diff adds.                  |

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

## Expert checklists (the law)

### Hard style rules (each violation blocks)

- Zero comments in TS/JS. Only tool directives (`@ts-`, `eslint-`) survive; the `conciv/no-comments` lint rule autofix-deletes everything else. Flag any comment, including "helpful" ones.
- Functions, not classes. Sole exception: `BaseTextAdapter` in `packages/harness/src/_shared/text-adapter.ts`.
- No IIFEs.
- No `any`, no `as` casts, no `@ts-ignore`, no non-null assertions (`!`). Prefer generics; a type-only dependency import should become a generic parameter instead.
- No `else`. Early-return, guards, ternary, map/reduce.
- Functional style: `map`/`reduce`/`flatMap` over `forEach` + mutation or push ladders.
- Descriptive names, no abbreviations, no barrel files, no "hub"/"manager"/"util" grab-bag naming.
- No em dashes anywhere, including strings and test names.
- zod validation (`readValidatedBody`) on every new HTTP route.
- v0, no external users: reject back-compat shims and deprecation layers; APIs are reshaped in place with all call sites updated.

### Test review

- Widget UI tests run in a REAL browser (Playwright/Chromium). jsdom or happy-dom in a widget test is blocking.
- Widget integration tests load the prebuilt bundle; `pnpm turbo run build --filter=@conciv/embed` must run first or they exercise stale code.
- Widget ITs use `browser.newPage()`, never `newContext()` (contexts leak, spike CPU/memory).
- No tests under `apps/examples/*`. Behavior is verified in the owning package, `@conciv/extension-testkit`, or an `e2e/` consumer app.
- Every Solid package `vitest.config.ts` pins `test: {environment: 'node'}`, otherwise `vite-plugin-solid` injects jsdom and the run exits 1 even with all tests passing.
- Never wait for Playwright `networkidle` with the live widget mounted; its SSE stream keeps the network busy forever. Wait for `domcontentloaded` or a UI signal.
- Assertions use native locators (`getByRole`, `getByText`). No test-ids in product code, no CSS implementation details in assertions, tight timeouts.
- No stubs/mocks of internal plumbing; testkits share the real plumbing. No test-only code or debug flags in product source.

### Architecture landmines

- Whiteboard (TanStack DB over libSQL): any db write inside a collection subscription, effect, or render body is a re-render storm. Writes belong in event handlers only.
- The widget bundle must externalize every `@conciv/extension/*` subpath and shared Ark/Solid deps; a second bundled copy splits context and extension popovers render at 0,0. The mount-externals build test guards this; reject anything that weakens it.
- Harnesses: adapters are capability-typed (`packages/protocol/src/harness-types.ts`). No spawning or decoding a CLI directly, no per-CLI special cases in core/widget. Harness workdirs are sandbox-virtual; a host-absolute cwd in an adapter config is a bug.
- Solid: props access via `splitProps` only (destructuring kills reactivity), no sends during render, no `useContext()` inline as a prop value.

### Security

- The core dev server binds `127.0.0.1` only; no credentials/tokens in code or logs.
- Changes to `packages/core/src/api/chat/permission.ts` or `packages/core/src/policy/command-policy.ts` must stay conservative (read-only auto-allow, everything else asks).

### Fallow

- INTRODUCED findings block merge; CI runs the same audit.
- Before flagging an export as dead, verify with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`. Packages in `.fallowrc.json` `publicPackages` are public API and never "unused". "USED but file unreachable" means a missing entry point, not dead code.

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
