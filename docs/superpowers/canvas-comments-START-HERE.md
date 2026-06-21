# canvas-comments — START HERE (resume pointer)

Entry point for resuming the canvas + source-anchored comments feature. Work happens in this
worktree: `.claude/worktrees/canvas-comments` (branch `worktree-canvas-comments`). Run every command
from this path — never `cd` to the main repo root or another worktree.

## Status (2026-06-21)

- Prior spike-quality attempt scrapped; branch reset clean to `origin/main`. The old code is preserved
  in the `slop-archive` git tag (reference only, do not reuse).
- Design + plan complete. All three external contracts characterized against the **real** binary/
  packages (not docs). No unknowns remain in the infrastructure layer.
- Nothing of the platform is built yet — next step is executing the infrastructure plan.

## Read in this order (source of truth)

1. `specs/2026-06-21-canvas-comments-design.md` — the design (what + why).
2. `notes/trailbase-api.md` — verified `trail` v0.22.9 Record API + realtime contract.
3. `notes/tanstack-db-contract.md` — verified `@tanstack/db` + native trailbase + Solid contract.
4. `plans/2026-06-21-canvas-comments-infrastructure.md` — the plan to execute (Part A = full
   interface catalog, Part C = 12 TDD tasks).

(`plans/2026-06-21-canvas-comments.md` is the original superseded 10-phase plan — historical.)

## Architecture in one breath

Core hosts two generic services exposed on the one composable extension API (`mx`): **`mx.db`** (live
collections over a supervised `trail`/SQLite, sole client + a gated reverse-proxy so the browser's
native `@tanstack/trailbase-db-collection` reaches trail only through core) and **`mx.sync`** (Yjs
rooms, snapshot persisted as a trail BLOB, gated SSE+POST relay). canvas-comments is a real extension
that wields them — built in a follow-up consumer plan after this infra lands.

## To execute (new session)

Use `superpowers:executing-plans`, inline (no dispatched subagents), TDD against real trail + real
browser (Playwright `newPage()`, native assertions, no mocks). Start at Task 1 (install gate: `yjs`,
`y-indexeddb`, `trailbase`→core) and stop for review at each task boundary.

Commit gotcha: the oxfmt pre-commit hook reformats files and fails the first attempt — just `git add
-A` and re-run the same commit (do NOT `--amend` as a fallback; it mangles the prior commit).
