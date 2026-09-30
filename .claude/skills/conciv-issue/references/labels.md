# Labels

Verified against the live label set (`gh label list --limit 60`) as of this writing. If a label
referenced here is missing, re-run that command — labels do drift.

## Lifecycle labels

The nightly issue tracker and the conciv-issue lane both read and write these. `agent:*` labels
plus `ready-for-agent` and `agent-triaged` track where an issue sits in the pipeline.

| Label                     | Meaning                                                              | Who sets it                                | What the lane does on seeing it                                                        |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `agent-triaged`           | Nightly issue tracker has investigated this issue.                   | Nightly tracker                            | Informational; does not gate picking.                                                  |
| `ready-for-agent`         | Ticket is fully specified and agent-grabbable.                       | Nightly tracker, or a human after grooming | Top of the pick order (Step 0).                                                        |
| `agent:in-progress`       | Nightly agent (or this lane) is investigating/working it right now.  | Lane, at dispatch                          | Skip — already claimed.                                                                |
| `agent:needs-info`        | Nightly agent needs a reproduction or detail from the reporter.      | Lane, after a failed-repro grooming pass   | Skip until the reporter adds detail.                                                   |
| `agent:blocked-external`  | Blocked on an upstream or a product decision.                        | Lane or human                              | Skip — not actionable by an agent.                                                     |
| `agent:already-resolved`  | Nightly agent (or this lane) found this already fixed on main.       | Lane, after proving it with a grep/test    | Terminal — issue gets closed.                                                          |
| `agent:answered`          | Nightly agent (or this lane) answered a question with evidence.      | Lane, for `question`-type issues           | Terminal if the asker's question is resolved; close.                                   |
| `agent:fix-proposed`      | Nightly agent opened a PR that fixes this.                           | Nightly tracker                            | Treat like `agent:implemented-in-pr` for picking purposes — skip, a PR already exists. |
| `agent:implemented-in-pr` | Implemented and gated locally; awaiting PR merge + full CI evidence. | Lane, at Step 3 hand-off                   | Skip — this lane's own terminal state; do not re-dispatch.                             |

Transitions this lane performs itself:

- At dispatch (Step 2): add `agent:in-progress`.
- At hand-off (Step 3): remove `agent:in-progress`, add `agent:implemented-in-pr`.
- If grooming proves the issue already fixed: add `agent:already-resolved`, close.
- If grooming can't establish a repro for a bug/flake: add `agent:needs-info`, comment the
  findings, move to the next issue.

## Type labels

Type labels describe _what kind_ of issue this is and change how Step 1 grooming proceeds.

| Label                 | Meaning                                                 | How it shapes grooming                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bug`                 | Something isn't working.                                | Requires an RCA plan before dispatch: evidence-only Phase 1, reproduce before fix. No repro → `agent:needs-info`, not a dispatch.                                                      |
| `enhancement`         | New feature or request.                                 | Needs acceptance criteria enumerable as greps/tests; write them into the issue body if missing.                                                                                        |
| `documentation`       | Docs-only change.                                       | Lighter gate: no code test suite required, but still one lane/one PR; likely `no-changeset`.                                                                                           |
| `question`            | Further information is requested.                       | Answer with evidence in a comment; label `agent:answered`; close if resolved. Not a code dispatch.                                                                                     |
| `flake`               | Intermittent test or CI failure.                        | Reproduce-before-fix is HARD — same bar as `bug`, no exceptions. A fix without a captured reproduction or an identified mechanism is not dispatchable.                                 |
| `refactor`            | Internal cleanup, no behavior change.                   | Acceptance criteria are usually "tests still pass, behavior unchanged" — verify there is no user-visible delta before treating it as done.                                             |
| `ci`                  | CI, build, or release infrastructure.                   | Gates are still typecheck/test/lint/fallow on the touched package, plus verifying the workflow YAML change against a real CI run (cached-green claims don't count for workflow files). |
| `testing`             | Test coverage or test infrastructure.                   | Acceptance criteria are the new/fixed tests themselves; still needs a real failing-before/passing-after pair.                                                                          |
| `dx`                  | Developer experience and tooling.                       | Same as `enhancement`; verify the tooling claim against a live run, not just reading the script.                                                                                       |
| `epic`                | Umbrella issue tracking a set of sub-issues.            | Never dispatch directly — pick a linked sub-issue instead; an epic has no single mergeable PR.                                                                                         |
| `security`            | Security hardening or vulnerability.                    | Treat like `bug` (RCA required) plus: never weaken an existing security gate to make a test pass.                                                                                      |
| `needs-investigation` | Needs RCA or a design decision before it is actionable. | Not dispatchable as-is. Grooming produces the RCA or surfaces the design question; the design question itself goes back to the user, it is not the lane's call.                        |
| `no-changeset`        | PR intentionally ships no release note.                 | Applied to the resulting PR (not the issue) when the fix touches only private/internal code or is docs-only; lets the changeset-coverage CI gate pass without a changeset.             |
