# Calm Chat Plane — execution handoff

Companion to the spec at `docs/superpowers/specs/2026-08-26-calm-chat-plane.md`. Read the spec first; this doc is operational state + how to run the work.

## Where things stand (2026-08-26)

- Branch `issue-589-integration` (pushed, head `aa50a9b7`) carries all of issue #589's fixes plus follow-ups: run-log self-contained snapshots, gate grammar + session approval memory, Ark tabs, virtualized JsonTree (2.6s → 85ms expand), truncation tooltips (`TruncatedText` in ui-kit-system), restored braille narration line (one continuous mount per run, Ark Presence label swap), demo-page `backdrop-filter` removal (13fps → 120fps scroll in Firefox). Fully gated: typecheck, serial forced tests (excl. whiteboard locally), embed ITs, lint, format, fallow, changesets.
- Issue #589 is filed; the integration branch has NO PR yet. Decide with Omri: one big PR vs split per lane.
- The spec was adversarially reviewed by codex (16 findings, all folded in) and every library claim was verified against the TanStack/ai clone at `/Users/omrikatz/Public/web/tanstack-ai` (pull it fresh before relying on it).

## Open items not in the spec

- T3 (rail active-indicator misalignment) is closed-unreproducible in Chromium; reopens only with a Firefox screenshot from Omri.
- `packages/mascot` `gaze.it.test.ts:143` timing flake — known, ticket-worthy, unfixed.
- Two pre-existing browser-test flakes under concurrent Chromium load: page-session-injection / markdown-highlight-warmup dynamic-import failures.
- Inline Stop on the narration line exists in the API but is deliberately not wired in chat-pane (composer STOP always available during narration). One line to wire if Omri asks.
- Card-with-summary-tooltip: a clipped title inside such a card has no reveal (summary owns the hover). Options documented in the tooltip agent's report; Omri hasn't chosen.

## How to execute (per spec phases)

1. Phase 0 first, exactly as specced: characterization harness with expected-failure markers annotated to mechanisms A/B/C. Fixture gates (`hold`/`release`, `holdTools`/`releaseTools`) live in `packages/harness-testkit/src/scripted-run.ts`.
2. Phase 1 upgrade: single-@tanstack/ai-instance assertion is part of the exit gate; the three known break sites are in the spec.
3. Phase 2: three stacked workstreams (2.a stores+migration, 2.b gate-to-interrupt adapter, 2.c transport swap). 2.b gets its own design review before implementation — it is the riskiest piece.
4. Phase 3 flips the harness to a blocking gate and fixes mechanisms A/B/C.

## Working rules (hard, from Omri / memory)

- Orchestrator designs and reviews; subagents implement. Subagents default sonnet; opus for widget-UI/design-heavy/adversarial work. State the model per dispatch.
- Agents work in their own worktrees, branch from `origin/issue-589-integration` (or the successor execution branch), orchestrator merges + pushes. Never `git stash` (shared across worktrees). Batch pushes.
- Headless browsers only in agents (`{headless: true}`) — headed windows pop on Omri's screen.
- Omri's browser is Firefox: visual verification and perf claims must hold there; committed suites stay on repo-standard Chromium.
- Never pipe gate commands through grep/tail (exit code becomes tail's) — redirect to a file, echo `$?`.
- Final gates run with `--force` (turbo cache masks regressions); tests serial (`TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1 --concurrency=1`); whiteboard suite never runs locally.
- Dev loop: `apps/examples/tanstack-start` `pnpm dev` (port 3000, run detached/nohup — task-managed background servers get killed by session interrupts). Browser packages hot-serve from source; core/harness/uno-preset changes need rebuild + server restart; new UnoCSS classes need an embed rebuild.
- Discussion style: terse, answer first, no plans until Omri asks for one. Do not park follow-ups — dispatch or surface them immediately.
- Every UI change: load impeccable:polish. Reference-exact for chat UX; when in doubt check assistant-ui / opencode / pi / ai-elements behavior first.

## Key research artifacts (session-local, re-derive if needed)

- Spec evidence lives in the spec's Evidence base section. The triage/RCA doc for #589: https://claude.ai/code/artifact/fd40090a-9c68-4f4b-9d23-d67480c32fea . The spec artifact mirror: https://claude.ai/code/artifact/c80426e7-042d-49c4-a15f-fcceeea0e657 (repo copy is authoritative).
- TanStack AI local clone: `/Users/omrikatz/Public/web/tanstack-ai`. Reference UIs cloned: `assistant-ui`, `opencode`, `pi-mono` under `/Users/omrikatz/Public/web/`.
