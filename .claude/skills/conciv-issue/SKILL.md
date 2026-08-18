---
name: conciv-issue
description: Use when asked to pick up a GitHub issue, work the issue backlog down, burn down issues, triage open tickets, groom an issue for an agent, pick up a ticket, or dispatch an agent to fix a ticket and close it with a PR.
---

# Working the conciv issue backlog

## Overview

Goal: open-issue count trends to zero. The unit of work is one lane: pick one issue, groom it,
dispatch one agent in one worktree, verify, open one PR whose merge auto-closes the issue. Never
batch several issues into one PR, and never merge — the user merges.

The orchestrator (this session) picks, grooms, verifies, and reports. Agents implement. The
orchestrator never edits product code.

## Step 0: pick one issue

```bash
gh issue list --state open --limit 60 --json number,title,labels
```

Selection order:

1. `ready-for-agent` and unassigned, smallest first — pre-groomed and grabbable.
2. Ungroomed issues with a clear defect and reproduction.
3. Everything else needs grooming first (that grooming is itself a valid lane outcome).

Skip: `agent:blocked-external`, `agent:needs-info`, `agent:in-progress`, `agent:implemented-in-pr`,
epics/RFCs, and anything already linked to an open PR (`gh pr list --search "NNN in:body"`). If
every remaining issue is blocked, say so and stop; do not force a lane.

Lifecycle labels, transitions, and type-label grooming rules: `references/labels.md`.

## Step 1: classify and groom

Read the full issue and comments (`gh issue view NNN --comments`). Verify every claim in the body
against current `origin/main` — issues go stale; file:line citations rot.

Required shape before dispatch, by type: bug — RCA plan first, evidence-only Phase 1, reproduce
before fix; no repro = comment findings, label `agent:needs-info`, next issue. Flake — same
reproduce-before-fix bar, HARD, no exceptions. Feature/refactor — acceptance criteria enumerable as
greps/tests; if missing, groom them into the body via `gh issue edit`. Question — answer with
evidence in a comment, label `agent:answered`, close if resolved.

If grooming reveals the issue is already fixed on main, prove it (grep/test), comment, label
`agent:already-resolved`, close. That counts as a completed lane.

## Step 2: dispatch one agent

- Worktree per issue: flat name `issue-NNN` (no `+` in path), pinned base `origin/main`.
- Agent type by shape: `conciv-frontend` (Solid/ui-kit/widget UI), `conciv-implementer`
  (server/core, judgment needed), `conciv-mechanic` (fully-specced mechanical). Model per global
  rules: sonnet default; opus only for adversarial review or design-heavy contract work. State the
  model in the dispatch.
- Dispatch is definition-of-done shaped, with the orchestrator pre-deciding the fix's design so
  the agent never stalls on a choice. Full skeleton: `references/dispatch-template.md`.
- Label the issue `agent:in-progress` at dispatch; run in background, no blocking waits.

## Step 3: verify and hand off

1. Review the agent's full diff yourself. Judge mechanism, not just correctness.
2. Re-run gates with `--force` (turbo cache greens are claims about old inputs).
3. Non-trivial diff → run the conciv-review skill on the branch before calling it done.
4. Confirm PR body carries `Fixes #NNN`, CI is green, then label the issue
   `agent:implemented-in-pr` and report the PR link to the user. The user merges; merge auto-closes
   the issue.

A full lane, checkpoint by checkpoint (including where three review rounds and one RCA earned
their keep): `references/worked-example-316.md`.

## Red flags — stop the lane

- "I'll fix these three related issues in one PR" — one issue, one PR.
- "The bug is obvious, skip the reproduction" — no repro, no fix.
- "CI is green, I'll merge it" — user merges. Always.
- "The issue body says the code does X" — verify against main first; bodies rot.
- Closing an issue by hand when a PR exists — `Fixes #NNN` closes it on merge; manual close loses
  the audit trail.
- Working in the main repo checkout — every lane gets its own worktree.
