# Plan 027: apps/conciv mutations stop silently swallowing failures — surfaced errors + cache invalidation

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- apps/conciv/src`
> If the cited files changed since this plan was written, re-verify the line references before editing; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 021 (CI must gate `apps/conciv` so this work is protected) — land 021 first
- **Category**: tech-debt
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

Reads in the conciv widget converged on `@tanstack/solid-query` (`useQuery` over `appData.utils.*`), but writes are split: some go through `useMutation`, while several fire bare `void rpc.X(...).catch(() => {})` and swallow every failure. So when a **permission decision**, **session stop/remove**, **draft save**, or **open-in-editor** RPC fails, the user sees nothing — no error, no retry, no cache invalidation, and the UI silently diverges from the server. New code copies whichever neighbor it sees, entrenching the split. This plan routes the swallowing call sites through the same `useMutation` pattern the codebase already uses (`chat-pane.tsx:138,191`), with an `onError` that surfaces the failure, so a failed mutation is visible and (where relevant) invalidates the affected query.

## Current state

The winning pattern already in the file — `useMutation` (`apps/conciv/src/chat/chat-pane.tsx:138-141`, `191-192`):

```ts
const uiReply = useMutation(() => ({
  mutationFn: (input: {toolCallId: string; value: unknown}) =>
    rpc.chat.uiReply({sessionId: props.sessionId, toolCallId: input.toolCallId, value: input.value}),
}))
const compact = useMutation(() => ({
  mutationFn: () => rpc.sessions.compact({sessionId: props.sessionId}),
  // ...
}))
```

The swallowing call sites (confirmed at this commit):

- `apps/conciv/src/chat/chat-pane.tsx:133` — `void rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})` — **a user's Approve/Deny decision; failure is invisible.**
- `apps/conciv/src/chat/chat-pane.tsx:232-240` — `void rpc.drafts...catch(() => {})` (draft persistence).
- `apps/conciv/src/chat/chat-pane.tsx:303-311` — another `rpc.drafts...catch(() => {})`.
- `apps/conciv/src/chat/chat-pane.tsx:349` — `void rpc.sessions.stop({sessionId: props.sessionId}).catch(() => {})`.
- `apps/conciv/src/routes/__root.tsx:107` — `openEditor={(file, line) => void app.rpc.editor.open({file, line}).catch(() => {})}`.
- `apps/conciv/src/routes/panel.$sessionId.$view.tsx:44` — `void rpc.sessions.create(undefined).then(...)`.
- `apps/conciv/src/routes/quick.tsx:117` — `void rpc.sessions.remove({sessionId: closed}).catch(() => {})`.

- `apps/conciv/src/data/app-data.ts` — the query/mutation layer: `makeAppData(rpc, queryClient)` exposes `utils` (query options) and `invalidateSessions()`. Use `invalidateSessions()` (or the relevant `utils.<x>.key()` invalidation) in mutation `onSuccess` where a write should refresh a read.

### How errors are surfaced today

Find the app's error-surfacing mechanism before writing `onError`. Check for a toast/notice system: `grep -rn "toast\|notice\|useToast\|Toaster" apps/conciv/src packages/ui-kit-system/src`. Plan 007 (toast transitions) and `ui-kit-system` suggest a toast primitive exists. Use whatever the app already uses to show a transient error; if there is genuinely no surface, log via the app's existing error path and STOP to report that a user-facing error channel is missing (don't invent a new UI).

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- Solid: never `sendMessage`/write signals in render bodies; mutations fire from event handlers. Do not destructure props.
- Mutations: `useMutation(() => ({mutationFn, onSuccess, onError}))` — the thunk form is the repo idiom (see the two exemplars above).
- Some of these are legitimately best-effort (e.g. `editor.open` — opening an editor is fire-and-forget UX). For those, keep them non-blocking but still surface a failure via `onError` instead of `.catch(() => {})`. The rule: **no `.catch(() => {})` that discards the error** — either handle it or surface it.

## Commands you will need

| Purpose                 | Command                                         | Expected on success |
| ----------------------- | ----------------------------------------------- | ------------------- |
| Typecheck               | `pnpm exec turbo run typecheck --filter=conciv` | exit 0              |
| Test                    | `pnpm exec turbo run test --filter=conciv`      | all pass            |
| Lint                    | `pnpm exec turbo run lint --filter=conciv`      | exit 0              |
| Find remaining swallows | `grep -rn "catch(() => {})" apps/conciv/src`    | empty at the end    |

## Scope

**In scope**:

- `apps/conciv/src/chat/chat-pane.tsx`
- `apps/conciv/src/routes/__root.tsx`
- `apps/conciv/src/routes/panel.$sessionId.$view.tsx`
- `apps/conciv/src/routes/quick.tsx`
- Possibly `apps/conciv/src/data/app-data.ts` (only to add an invalidation helper if a needed one is missing)

**Out of scope**:

- The RPC contract (`packages/contract`) — behavior of the routes is fine; only the client call sites swallow.
- Reads (`useQuery` sites) — they already converged; don't touch.
- Building a new toast/notification UI — reuse the existing one (see "How errors are surfaced today"); if none exists, STOP and report.
- The server-side `void ... .catch(() => {})` in `packages/core` (those are separate; e.g. plan 031 covers the minted-id one) — this plan is `apps/conciv` client only.

## Git workflow

- Branch: `advisor/027-route-mutations-through-query-layer`
- Commit style: `fix(conciv): route swallowing mutations through useMutation with surfaced errors`
- Commit per file or per logical group; do NOT push or open a PR unless instructed.

## Steps

### Step 1: Identify the error surface

Run the grep from "How errors are surfaced today" and pick the existing toast/notice mechanism. Confirm how an existing mutation reports failure (search for `onError` in `apps/conciv/src`). If found, use it as the pattern for every conversion below. If not found, STOP and report.

**Verify**: you have a concrete `onError` pattern from the existing codebase to apply.

### Step 2: Convert `permissionDecision` (highest priority)

In `chat-pane.tsx:133`, replace the bare `void rpc.chat.permissionDecision(...).catch(() => {})` with a `useMutation` (define it near the `uiReply`/`compact` mutations) whose `mutationFn` calls `rpc.chat.permissionDecision({approvalId, approved})` and whose `onError` surfaces the failure. Call `.mutate({approvalId, approved})` from the Approve/Deny handler. This is the most important conversion — a dropped permission decision leaves the agent hung with no feedback.

**Verify**: `pnpm exec turbo run typecheck --filter=conciv` → exit 0; the Approve/Deny handler calls the mutation, not a swallowing `void rpc`.

### Step 3: Convert `sessions.stop` and `sessions.remove`

- `chat-pane.tsx:349` — `sessions.stop` → `useMutation` with `onError`. On success, no invalidation needed (the SSE stream reflects stop), but surface errors.
- `quick.tsx:117` — `sessions.remove` → `useMutation` with `onError` + `onSuccess: invalidateSessions` (removing a session should refresh the session list).

**Verify**: `pnpm exec turbo run typecheck --filter=conciv` → exit 0.

### Step 4: Convert draft saves and remaining sites

- `chat-pane.tsx:232-240` and `:303-311` — the `rpc.drafts...catch(() => {})` writes. These are frequent/debounced; convert to a `useMutation` (or keep the async call but replace `.catch(() => {})` with an `onError`/logged surface — a failed draft save should at least be visible, not silent). Do not spam a toast on every keystroke-debounced save failure; surface it once (e.g. gate on a changed error). Use judgment consistent with the existing draft-save code.
- `__root.tsx:107` — `editor.open` is best-effort UX; convert `.catch(() => {})` to surface the error (e.g. a toast "couldn't open editor") so a missing editor/PATH issue is visible.
- `panel.$sessionId.$view.tsx:44` — `sessions.create(...).then(...)`; ensure its rejection is handled (surface an error) rather than an unhandled/ignored promise.

**Verify**: `grep -rn "catch(() => {})" apps/conciv/src` → returns nothing.

### Step 5: Typecheck, test, lint

**Verify**:

- `pnpm exec turbo run typecheck lint test --filter=conciv` → exit 0, all pass.

## Test plan

- `apps/conciv` tests live in `apps/conciv/test`. Add/extend a test that a mutation's `onError` fires on a rejected RPC — the most valuable is permission-decision failure surfacing. If the app's test setup can stub the `rpc` client, assert that a rejected `permissionDecision` triggers the error surface rather than being swallowed.
- If the app has no unit-test seam for these handlers, verify via the owning package's testkit or a browser IT that a failed action shows an error. Do NOT add tests under `apps/examples`.
- Verification: `pnpm exec turbo run test --filter=conciv` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -rn "catch(() => {})" apps/conciv/src` returns nothing
- [ ] `permissionDecision`, `sessions.stop`, `sessions.remove`, draft saves, and `editor.open` all surface failures (via the existing error mechanism) instead of discarding them
- [ ] `sessions.remove` invalidates the session list on success
- [ ] `pnpm exec turbo run typecheck lint test --filter=conciv` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The cited call sites don't match "Current state" (drift).
- There is no existing user-facing error surface in the app to route `onError` into — report; adding a new notification UI is a design decision for the maintainer, out of this plan's scope.
- Converting the debounced draft saves to mutations causes a toast storm or fights the existing debounce — report the interaction; a debounced write may warrant a quieter surface (log once) rather than a per-save toast.
- CI is not yet gating `apps/conciv` (plan 021 not landed) — you can still do the work, but note the app isn't protected; prefer landing 021 first.

## Maintenance notes

- The convention to establish: every RPC write in the app goes through `useMutation` with an `onError` surface and, where it changes read state, an `onSuccess` invalidation. No `.catch(() => {})`. A reviewer should reject new swallowing call sites.
- Best-effort actions (open editor) can stay non-blocking, but "best-effort" means "handle the error quietly and visibly if it matters", not "discard it".
- If the RPC contract later adds optimistic-update support, these mutations are the natural place to add `onMutate`/rollback.
