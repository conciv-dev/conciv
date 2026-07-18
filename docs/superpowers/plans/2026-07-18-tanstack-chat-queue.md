# TanStack Chat Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Conciv's custom queue with TanStack AI's native FIFO/cancel/interrupt queue and expose it in the composer without regressing cross-surface sessions.

**Architecture:** `useChatSession` owns the TanStack queue configuration. UI state is read directly from `UseChatReturn.queue`; only remote `sessionGenerating` needs a narrow forwarding bridge because TanStack deliberately treats loading as request-local.

**Tech Stack:** TypeScript, SolidJS, TanStack AI Solid 0.15, TanStack AI Client 0.22, Vitest, Vitest Browser/Playwright, pnpm, Turbo.

## Global Constraints

- Work on `feat/tanstack-chat-queue` from `origin/main`.
- Write each behavioral test before its implementation and observe the expected failure.
- Keep functions, avoid IIFEs, and add no TypeScript comments.
- Preserve multimodal `sendMessage` content even when queue rows display text only.
- Do not modify CI.

---

### Task 1: Upgrade the TanStack queue API

**Files:**

- Modify: all package manifests directly declaring `@tanstack/ai-client` or `@tanstack/ai-solid`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/client/src/use-chat-session.ts`
- Test: `packages/client/test/use-chat-session.test.ts`

**Interfaces:**

- Produces: `UseChatReturn.queue`, `cancelQueued(id)`, and `sendMessage(content, {whenBusy})` throughout Conciv.

- [ ] Add a test that captures the `useChat` options and expects `{queue: {whenBusy: 'queue', drain: 'fifo'}}`.
- [ ] Run the focused client test and verify it fails because no queue option is passed.
- [ ] Upgrade the direct dependencies and lockfile.
- [ ] Pass the FIFO queue configuration from `useChatSession`.
- [ ] Run client tests after building workspace dependencies and verify they pass.

### Task 2: Replace guardChat with a remote-session bridge

**Files:**

- Modify: `packages/ui-kit-chat/src/store/chat-busy.ts`
- Modify: `packages/ui-kit-chat/test/chat-busy.test.ts`
- Modify: `packages/ui-kit-chat/src/index.tsx`
- Modify: `apps/conciv/src/chat/chat-pane.tsx`

**Interfaces:**

- Consumes: native `UseChatReturn.sendMessage`, `sessionGenerating`, and local status.
- Produces: a wrapped send path that delays only when another surface owns the run.

- [ ] Replace guard tests with failing tests for immediate local forwarding, remote-session delay, ordered release, and disposal.
- [ ] Verify the tests fail against `guardChat`.
- [ ] Implement the minimal remote-session bridge without a duplicate local queue.
- [ ] Remove `guardChat` and make `ChatPane` consume the native chat return plus the bridge.
- [ ] Run ui-kit-chat tests and verify they pass.

### Task 3: Expose native queue controls in the composer

**Files:**

- Modify: `packages/ui-kit-chat/src/store/chat-context.tsx`
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer.tsx`
- Modify: `packages/ui-kit-chat/src/styled/composer.tsx`
- Modify: `apps/conciv/src/chat/chat-pane.tsx`
- Test: `packages/ui-kit-chat/src/styled/composer.stories.tsx`
- Test: `packages/ui-kit-chat/src/primitives/composer/composer.stories.tsx`

**Interfaces:**

- Consumes: `queue()`, `cancelQueued(id)`, and per-call interrupt sends.
- Produces: visible pending rows with Remove and Steer actions and an active Send control while generating.

- [ ] Add browser assertions that a busy composer remains sendable and renders native queued messages.
- [ ] Verify those assertions fail with the current busy-disabled composer.
- [ ] Make `canSend` depend on content rather than generation state and show Send beside Stop.
- [ ] Map TanStack queued content into existing queue primitives.
- [ ] Wire Remove to `cancelQueued` and Steer to cancel plus interrupt resend.
- [ ] Run the focused Storybook browser tests and verify they pass.

### Task 4: Verify and publish

**Files:**

- Create: one patch changeset for the affected public Conciv package set.

- [ ] Run package-focused tests and typechecks.
- [ ] Run `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm lint`, and `pnpm format:check`.
- [ ] Run `pnpm exec fallow audit --changed-since main --format json` and fix all introduced findings.
- [ ] Review `git diff origin/main...HEAD` for compatibility and unintended generated files.
- [ ] Commit the verified implementation, push `feat/tanstack-chat-queue`, open a PR against `main`, and read the PR back to verify its head SHA.
