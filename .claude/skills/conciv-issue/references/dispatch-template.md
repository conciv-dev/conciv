# Dispatch template

A definition-of-done dispatch is a fill-in template, not free text. Every section below exists to
close one specific way lanes have gone wrong before. Fill in every section; do not skip one because
"it's obvious" — the agent reading the dispatch has none of this session's context.

## Setup

Why: an agent with no worktree, or a worktree branched from a stale local `main`, produces a diff
that can't land cleanly and wastes the whole lane.

```bash
git -C /Users/omrikatz/Public/web/aidx worktree add \
  /Users/omrikatz/Public/web/aidx/.claude-worktrees/issue-NNN -b issue-NNN origin/main
```

- `pnpm install` in the new worktree if the lockfile changed since the last worktree was cut.
- HARD warning to include verbatim in the dispatch: Bash cwd snaps back to the repo root between
  tool calls — pin the absolute worktree path in every command, never rely on a prior `cd`.

## The fix, decided shape

Why: an agent with a genuine design choice in front of it either stalls asking for clarification
(defeating background dispatch) or picks silently and produces a diff the orchestrator has to
re-litigate. The orchestrator makes every judgment call before dispatch and states it as a ruling.

Enumerate each ruling explicitly, e.g.:

- "Use option 2 from the issue body (targeted guard in `guards.ts`), not option 1
  (`changeset status` in CI) — rejected for its zero-changeset exit-code quirk."
- "New state belongs in a store, not a parallel signal — see `references/labels.md` if the issue
  touches Solid state."
- Any file/module boundary the agent must not cross.

## Constraints

Repo law, restated because agents drift toward convenient defaults under pressure:

- Functions, not classes. Zero comments in TS/JS. No `any`/`as`/non-null assertion/IIFE.
- oxfmt formatting (no semicolons, single quotes, trailing commas).
- Verify every API call against the resolved source in `node_modules` (or the package's own
  `src/`), never guess a signature from memory or training data.

## Dependencies

NO new dependencies unless the dispatch names a package the USER approved verbatim. If a
dependency seems needed mid-implementation, the agent stops and reports back instead of installing
it.

Why this rule exists: an agent's inference that "the user would probably approve this" is
fabricated consent, not real consent — only an explicit prior approval counts.

## Acceptance criteria

Verbatim from the groomed issue body, each phrased so it is checkable as a grep or a test run —
not a prose restatement the orchestrator has to reinterpret at verification time.

## Gates

Run from the worktree, in this order:

```bash
pnpm -C <worktree> exec turbo run typecheck --filter=<pkg> --force
env TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1 \
  pnpm -C <worktree> exec turbo run test --concurrency=1 --filter=<pkg> --force
pnpm lint
pnpm format:check
pnpm exec fallow audit --changed-since origin/main --format json
```

- Fallow: 0 `introduced` findings. JSON runtime errors (`{"error": true, ...}`) are non-blocking.
- Changeset decision: needed when a published package's runtime behavior changes; the
  `check-changesets` CI gate (verify-changesets.yml) enforces coverage. If the PR intentionally
  ships no release note (docs-only, internal tooling, a private package), apply the `no-changeset`
  label instead of adding one.

## Deliverable

- Conventional commits, each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Plain push (never force-push a fresh branch that has no upstream history to protect).
- `gh pr create` with a body that explains the mechanism of the fix (not just "fixes the bug"),
  the exact line `Fixes #NNN`, and the Claude Code generated-by footer.
- Never merge — the user merges.
- Final report shape: a per-acceptance-criterion table (met / how verified), gate command outputs,
  commit SHAs, and any deviations from the dispatch with a one-line reason each.
