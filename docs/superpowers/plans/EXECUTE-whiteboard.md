# Execute — Whiteboard extension

Paste the block below into a fresh session to execute the plan.

---

Execute the Whiteboard extension implementation plan. Work ONLY in the worktree
/Users/dev/Public/web/aidx/.claude/worktrees/canvas-comments (branch
worktree-canvas-comments) — run every command from that path, never cd to the main repo.

Use superpowers:executing-plans. Implement task-by-task, in order, checkpointing with me
between phases.

READ FIRST, in order:

- docs/superpowers/plans/2026-06-21-whiteboard-extension.md (THE plan — follow it exactly;
  the "Post-review revisions" section SUPERSEDES any conflicting task text)
- docs/superpowers/notes/platform-phase0-gaps.md (the 7 gaps + Extra A/B/C, pinned to file:line)
- docs/superpowers/notes/excalidraw-react-island.md (Excalidraw API + React-in-shadow)
- docs/superpowers/notes/trailbase-api.md and docs/superpowers/notes/tanstack-db-contract.md
  (the data layer)

START at Phase 0, Task 0.1. Do NOT skip ahead. Stop at each "Phase exit gate" and report
before continuing.

HARD RULES (non-negotiable):

- TDD every step: write the failing test, RUN it and confirm it fails for the right reason,
  implement minimally, RUN and confirm pass, commit. Real evidence before any "done" claim.
- Real tests only: real trail (createTrailSupervisor) + real Chromium (playwright
  chromium.launch -> browser.newPage(), NEVER newContext()). No mocks, no stubs, no jsdom.
  Native assertions only (getByRole/getByText/toBeVisible/aria) — never querySelector, class
  selectors, or toBe(true) on DOM; reach the widget shadow root via getByRole().getRootNode().
- Run widget/whiteboard ITs with SKIP_STORYBOOK_TESTS=1. Build/typecheck via turbo from root
  (turbo run typecheck --filter ...). Parallel ITs: a fresh getPort() per suite for the trail
  port AND the page-server port.
- Code style: functions not classes (the ONE allowed class is the React error boundary in
  island.tsx — call it out in that commit); no IIFE; ZERO comments; no any/casts/else; prefer
  generics. Functional (map/reduce).
- NEVER install a dep without asking me first. The plan has explicit INSTALL-APPROVAL GATES
  (react/react-dom/@excalidraw/excalidraw before Phase 1; @excalidraw/mermaid-to-excalidraw
  before Task 2.7; solid-sonner before Task 7.3) — STOP and ask at each.
- NEVER patch deps, edit node_modules, git stash, or deviate from the plan's approach without
  asking. If a fix smells like a hack, STOP and ask.
- oxfmt reformats on the first commit of a file — when the pre-hook reformats, git add -A and
  re-run the SAME commit. End every commit message with:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
- Work inline — do the coding directly, do not dispatch subagents.
- If any Phase-0 gap turns out bigger than a small public-API addition, STOP and ask.

Phase 0 lands 7 platform additions + the package scaffold + first-party loader + Gap 8 (column)

- Task 0.8 (the whiteboard IT harness). Begin with Task 0.1 (CORS PATCH).
