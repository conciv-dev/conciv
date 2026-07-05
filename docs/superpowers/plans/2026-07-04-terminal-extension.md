# Terminal Extension Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move terminal mode from core into a built-in extension (`packages/extensions/terminal`), growing the extension API with panel views (animated ui-kit-system Tabs) and narrow server session/harness surfaces.

**Architecture:** See `docs/superpowers/specs/2026-07-04-terminal-extension-design.md`. This plan REFACTORS the working v1 implementation already on this branch (`worktree-tty-terminal-mode`) — most tasks move existing, tested files and rewire integration points; new code is the extension API growth.

**Supersedes:** `2026-07-04-tty-terminal-mode.md` (v1 plan, fully executed through its Task 7).

## Global Constraints

Same as the v1 plan (functions only, zero comments, no else/non-null/any, unstyled+styled ui-kit split, real-everything tests, turbo builds, pathspec commits, prek-race workaround). Additions:

- Mirror the whiteboard extension's package layout (`packages/extensions/whiteboard`) for the new extension: `package.json` exports (`.` server, `./client`), `server.ts`, `client.tsx`, `shared/`.
- The v1 fixes are load-bearing and MUST survive the move byte-for-byte: spawn-helper exec-bit self-heal (`spawn-helper-fix.ts`), nested-CLAUDE-env stripping (`unsetEnvPrefixes` in `claude/tty.ts`), stale-resume-token transcript check.
- ui-kit-system `Tabs` (`packages/ui-kit-system/src/tabs.tsx`) is the ONLY tab control — its `Indicator` slides via `--left`/`--width`; never build a hand-rolled toggle.

---

### Task 1: Extension API — panel views + view lock

**Files:**

- Modify: `packages/extension/src/types.ts` (add `ExtensionView`, extend `ExtensionHostContext` with `view`)
- Modify: `packages/extension/src/define-extension.ts` (meta field `views`, thread through builder)
- Modify: `packages/widget/src/extension/extension-slots.tsx` or a new `packages/widget/src/extension/extension-views.ts` (collect views from instances)
- Modify: `packages/widget/src/chat/chat-panel.tsx` (tab bar + body swap replaces the v1 mode UI)
- Delete: `packages/widget/src/chat/mode-toggle.tsx`
- Revert: `terminal-header` slot in `packages/extension/src/types.ts` (v1 addition, dropped per spec)
- Test: `packages/widget/test/panel-views.test.ts` (or extend an existing widget component test file pattern if one covers ChatPanel)

**Interfaces:**

- Produces:

```ts
export type ExtensionView = {id: string; label: string; icon?: Component; Component: Component}
// ExtensionMeta/ExtensionBuilder gain: views?: readonly ExtensionView[]
// ExtensionHostContext gains: view: {setLocked(locked: boolean): void}
export function collectViews(instances: ExtensionInstance[]): (ExtensionView & {instance: ExtensionInstance})[]
```

- ChatPanel behavior: `views.length === 0` → render exactly as today (no tab bar). Otherwise render, above the body:

```tsx
<Tabs.Root value={activeView()} onValueChange={(d) => void switchView(d.value)}>
  <Tabs.List>
    <Tabs.Trigger value="chat" disabled={leaveGuard()}>
      Chat
    </Tabs.Trigger>
    <For each={views()}>
      {(v) => (
        <Tabs.Trigger value={v.id} disabled={leaveGuard()}>
          {v.label}
        </Tabs.Trigger>
      )}
    </For>
    <Tabs.Indicator />
  </Tabs.List>
</Tabs.Root>
```

with `leaveGuard = () => working() || viewLocked()` (chat turn in flight, or the active view called `view.setLocked(true)`); `switchView('chat')` re-fires the existing `client.history` load path (rehydration); the active view's `Component` renders in place of `<Thread …/>` inside the same flex column; active view resets to `'chat'` on session change.

- [ ] **Step 1: Write the failing widget test** — mount ChatPanel-shaped fixture with a fake instance contributing one view (real Solid render, browser env per widget test conventions): assert (a) no `tablist` when no views, (b) `tablist` with `Chat` + view label when contributed, (c) clicking the view tab renders the view Component and hides the composer, (d) exactly ONE indicator element exists before and after switching (animates, not remounts). If ChatPanel proves too entangled for a component test, test `collectViews` + a small extracted `PanelViewTabs` component instead — the full loop lands in Task 6's IT.
- [ ] **Step 2: Run it, verify failure** — `pnpm --filter @conciv/widget vitest run <file>` (or `pnpm exec vitest` from the package; match existing scripts).
- [ ] **Step 3: Implement** types + builder threading + `collectViews` + ChatPanel wiring per the interface block. Host bag: provide `view.setLocked` writing a per-view signal map keyed by view id; no-op implementation in slot renders.
- [ ] **Step 4: Tests pass** — same command.
- [ ] **Step 5: Typecheck widget+extension, commit** — `git commit --no-verify -m "feat(extension): panel views contribution + animated tab bar" -- packages/extension packages/widget`

---

### Task 2: Extension API — server sessions/harness surfaces

**Files:**

- Modify: `packages/extension/src/types.ts` (`ServerApi` grows `sessions` + `harness`)
- Modify: `packages/core/src/app.ts` (build the surfaces from `store`, `readLock`, and the resolved harness adapter; pass into `extension.__server`)
- Test: `packages/core/test/api/extension-server-surfaces.it.test.ts`

**Interfaces:**

```ts
export type ServerSessions = {
  resumeToken(sessionId: string): Promise<string | null>
  recordToken(sessionId: string, token: string): Promise<void>
  chatBusy(sessionId: string): boolean
}
export type ServerHarness = {
  id: string
  ttyCommand?: (opts: TtyCommandOpts) => TtyCommand
  release?: (sessionId: string) => void
  transcriptExists?: (token: string) => boolean
}
export type ServerApi<Config> = {config: Config; cwd: string; app: H3; sessions: ServerSessions; harness: ServerHarness}
```

Core builds them in `makeApp`: `resumeToken`/`recordToken` delegate to the helpers in `packages/core/src/api/chat/turn.ts:17-19` (plus `ensureChatRecord` inside `recordToken` for fresh sessions); `chatBusy` = `readLock(stateRoot, id).held`; `harness.ttyCommand` = `adapter.tty?.command` bound with `cwd`? No — pass through as-is (the extension supplies `TtyCommandOpts`); `transcriptExists` wraps `adapter.history.transcriptPath` + `existsSync` (absent history → undefined).

- [ ] **Step 1: Failing IT** — boot `makeApp` (pattern: `packages/core/test/api/extension-app.it.test.ts`) with a test extension whose `.server()` captures its `ServerApi`; assert `sessions.recordToken` then `resumeToken` round-trips through the real fs store, `chatBusy` flips with `acquireLock`/`releaseLock`, and `harness.id` matches.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** per interface block. `makeExtensionApp` call site in `app.ts` already constructs the server object — extend it.
- [ ] **Step 4: Tests pass; full core suite green** (`pnpm --filter @conciv/core test` style command per package scripts).
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(extension): server sessions + harness surfaces" -- packages/extension packages/core`

---

### Task 3: Create packages/extensions/terminal — server side (move from core)

**Files:**

- Create: `packages/extensions/terminal/package.json`, `tsconfig.json` (+ build config) — mirror `packages/extensions/test-runner` exactly; deps: `@conciv/extension`, `@conciv/protocol`, `node-pty`, `zod`; client export adds `@conciv/ui-kit-terminal`, `solid-js` peer
- Move: `packages/core/src/api/tty/pty-sessions.ts` → `packages/extensions/terminal/src/server/pty-sessions.ts`
- Move: `packages/core/src/api/tty/osc-busy.ts` → `packages/extensions/terminal/src/server/osc-busy.ts`
- Move: `packages/core/src/api/tty/spawn-helper-fix.ts` → `packages/extensions/terminal/src/server/spawn-helper-fix.ts`
- Create: `packages/extensions/terminal/src/shared/protocol.ts` — move `TtyClientControlSchema`, `TtyServerControlSchema` from `@conciv/protocol/terminal-types` (which keeps only `TtyCommand`/`TtyCommandOpts`; `SessionMode`/`SetMode*` schemas are deleted — mode is gone)
- Create: `packages/extensions/terminal/src/server.ts` — extension definition `.server()` registering routes
- Delete: `packages/core/src/api/tty/tty.ts` + its registration/dispose in `packages/core/src/app.ts`
- Move tests: `packages/core/test/api/tty-pty-sessions.it.test.ts` and `tty-routes.it.test.ts` → `packages/extensions/terminal/test/`, re-targeted at the extension sub-app
- Modify: `packages/it/src/plugin-instance.ts` — register the builtin (server + client entry) beside whiteboard/test-runner

**Interfaces (extension routes, session id via `?session=` or the conciv session header exactly as the moved route code already does):**

- `POST /api/ext/terminal/open` body `{cols?, rows?}` → `{alive: true}`; 409 `sessions.chatBusy`; 400 no `harness.ttyCommand`. Token flow + stale-transcript self-heal move verbatim from the deleted `tty.ts` (swap direct imports for `server.sessions`/`server.harness`).
- `POST /api/ext/terminal/close` → `{alive: false}`; 409 while pty busy.
- `GET /api/ext/terminal/state` → `{alive: boolean, busy: boolean}`.
- `GET /api/ext/terminal/tty` → WS via `defineWebSocketHandler` (open/message/close hooks move verbatim; 4404 close when no live pty).

- [ ] **Step 1: Scaffold package, move the three server files + two test files** (git mv; fix import specifiers only).
- [ ] **Step 2: Re-target the routes IT** at `/api/ext/terminal/…` — boot via `makeApp` with the terminal extension + a bash-tty harness surface (the test adapter from the old IT becomes the makeApp harness stub or the surfaces from Task 2 are constructed directly). Run → fails (no `server.ts` yet).
- [ ] **Step 3: Write `server.ts`** — `defineExtension({name: 'terminal'}).server(...)` building `createTtySessions()` + routes; `dispose` = `ttySessions.shutdown()`. Port the deleted `tty.ts` logic: `open` = old `mode: terminal` branch, `close` = old `mode: chat` branch, `state` new, WS handler verbatim.
- [ ] **Step 4: Delete core tty files + app.ts wiring; run extension tests + full core suite** — all green; core no longer depends on `node-pty` (remove from `packages/core/package.json`).
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(extensions): terminal extension server (pty moved out of core)" -- packages/extensions/terminal packages/core packages/protocol packages/it pnpm-lock.yaml`

---

### Task 4: Terminal extension client — view registration

**Files:**

- Create: `packages/extensions/terminal/src/client.tsx` — extension `views: [{id: 'terminal', label: 'Terminal', icon: SquareTerminal, Component: TerminalPanelView}]`
- Move+rework: `packages/widget/src/chat/terminal-view.tsx` → `packages/extensions/terminal/src/client/terminal-panel-view.tsx`
- Delete: `packages/widget/src/chat/terminal-view.tsx`, api-client `mode`/`setMode`/`ttyUrl` (revert commit `4149a81` content)
- Modify: `packages/widget/uno.config.ts` — content glob `'../extensions/terminal/src/**/*.{ts,tsx}'` (whiteboard already sets the precedent)

**Interfaces:** `TerminalPanelView` (no props; everything from extension context):

- `const ctx = terminal.useContext()` at render scope (never inline in handlers): `ctx.client` for session id + apiBase, `ctx.view.setLocked`, `ctx.notify` for 409 toasts.
- On mount: `POST open` (fetch with conciv session header from `ctx.client.chatHeaders()`); pending → connecting state; failure → notify + render error banner with retry.
- `createTerminalModel({url: () => wsUrl(ctx.client), theme: () => readTerminalTheme(host)})` — `readTerminalTheme` moves along (reads `--pw-*` tokens); `wsUrl` builds `/api/ext/terminal/tty?session=…&cols=…&rows=…` from `apiBase` with the ws/wss protocol swap (port the deleted `ttyUrl` helper here).
- `createEffect(() => ctx.view.setLocked(model.busy()))`; onCleanup `setLocked(false)` + `POST close` (fire-and-forget with `.catch` → notify).

- [ ] **Step 1: Move + rewire the view component and write `client.tsx`.**
- [ ] **Step 2: Revert the api-client additions; typecheck api-client + widget + extension packages.**
- [ ] **Step 3: Build all touched packages via turbo; run ui-kit-terminal + widget unit tests.**
- [ ] **Step 4: Commit** — `git commit --no-verify -m "feat(extensions): terminal panel view client" -- packages/extensions/terminal packages/widget packages/api-client pnpm-lock.yaml`

---

### Task 5: Live verification in the example app (visual contract)

- [ ] **Step 1: Rebuild** core/widget/extension/it via turbo; restart the example dev server (`apps/examples/tanstack-start`, `pnpm dev`, clean env — strip `CLAUDECODE`/`CLAUDE_CODE_*` when launched from inside a claude session).
- [ ] **Step 2: Drive with playwright-cli**: open widget → tab bar shows Chat|Terminal with ONE sliding indicator (inspect: single indicator element repositions on switch); terminal tab → live claude TUI; run a turn; back to Chat → rehydrated message visible; `/exit` in TUI → banner + Back to chat.
- [ ] **Step 3: Compare against the mockup** (`specs/assets/2026-07-04-tty-terminal-mode-mockup.html`) for the terminal surface + busy/exit states; fix drift now.
- [ ] **Step 4: Tell the user it's live and where.**

---

### Task 6: End-to-end widget IT + docs

**Files:**

- Rework: `packages/widget/test/terminal-mode.it.test.ts` (v1 Task 8 file if present, else create) — tabs via `getByRole('tab', …)`, indicator singleton assertion, full claude loop, quick-terminal pane coverage
- Modify: superseded-note at the top of the v1 spec + plan; memory updates happen outside the repo

- [ ] **Step 1: Rebuild core (ITs run built code), write/adapt the IT** per v1 Task 8 but tab-based; assertions read the xterm buffer via the `data-terminal-screen` element hook (`__concivTerminal.buffer()`).
- [ ] **Step 2: Run it plus the full suites** for extension/widget/core/ui-kit-terminal — green.
- [ ] **Step 3: Add "Superseded by 2026-07-04-terminal-extension-design.md" header lines to the v1 spec and v1 plan; commit docs + IT** — `git commit --no-verify -m "test(widget): terminal extension e2e + docs supersede notes" -- packages/widget docs/superpowers`

## Self-review

- Spec coverage: views API (T1), server surfaces (T2), extension server + route move + protocol slimming + builtin registration (T3), client view + api-client revert + uno glob (T4), visual contract + live check (T5), e2e + docs (T6). v1 carry-overs preserved by Global Constraints. `terminal-header` slot reverted in T1.
- The v1 plan's remaining unfinished work (T7 visual polish, T8 IT) is absorbed into T5/T6 here.
