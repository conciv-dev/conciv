# Terminal Extension — Design (v2, supersedes tty-terminal-mode core design)

Date: 2026-07-04
Status: approved (brainstorm with user)
Supersedes: `2026-07-04-tty-terminal-mode-design.md` — the feature moves out of core into a built-in extension. The v1 spec's wire protocol, pty service semantics, busy detection, mockup, and hard-won fixes all carry over; only ownership and integration surfaces change.
Mockup: `assets/2026-07-04-tty-terminal-mode-mockup.html` remains the visual contract for the terminal surface. The tab control is superseded by the ui-kit-system `Tabs` pattern (animated sliding indicator, never appear/disappear).

## Decision

Rebuild terminal mode as `packages/extensions/terminal` — a built-in extension like test-runner and whiteboard. The user asked whether the extension API fits: it does for the server side (extensions own an H3 sub-app under `/api/ext/<slug>/`, WebSocket routes included, own npm deps); it lacks two generic capabilities, which we grow deliberately because other extensions want them too:

1. **Panel views** — extensions can contribute alternative panel bodies (`{id, label, icon, Component}`). The widget renders a tab bar (Chat + contributed views) using `ui-kit-system` `Tabs` with its existing animated `Indicator` (`packages/ui-kit-system/src/tabs.tsx`), and swaps the panel body. Whiteboard and test-runner are future consumers.
2. **Server session/harness surfaces** — `ServerApi` grows two narrow services (not raw store/adapter access):
   - `sessions: {resumeToken(id): Promise<string | null>; recordToken(id, token): Promise<void>; chatBusy(id): boolean}`
   - `harness: {id: string; ttyCommand?(opts: TtyCommandOpts): TtyCommand; release?(id: string): void; transcriptExists?(token: string): boolean}`

## What lives where

**`packages/extensions/terminal`** (new, built-in):
- `server.ts`: pty session service, OSC 9;4 busy tracker, spawn-helper exec-bit self-heal (all move verbatim from `packages/core/src/api/tty/`), plus routes on the extension sub-app:
  - `POST /api/ext/terminal/open` `{cols?, rows?}` → 409 while `sessions.chatBusy`; resolves/mints the harness session token via `sessions`, checks `harness.transcriptExists` to decide resume-vs-pin (stale-token self-heal), spawns via `harness.ttyCommand`, calls `harness.release` first.
  - `POST /api/ext/terminal/close` → 409 while terminal busy; kills the pty.
  - `GET /api/ext/terminal/state` → `{alive, busy}`.
  - `GET /api/ext/terminal/tty?session=…&cols=…&rows=…` → WebSocket (same wire protocol as v1: binary = pty bytes both ways with replay-first, JSON text frames = control).
- `client.tsx`: registers the terminal panel view; the view component wires `@conciv/ui-kit-terminal` to the extension endpoints, forwards busy to the view-lock, and opens/closes the pty on mount/unmount.
- `shared/`: WS control-frame + endpoint schemas (moved out of `@conciv/protocol/terminal-types`; only `TtyCommand`/`TtyCommandOpts` stay in protocol — they are the harness adapter contract).
- deps: `node-pty`, `@conciv/ui-kit-terminal`, `@conciv/extension`.
- Registered in `packages/it/src/plugin-instance.ts` builtins beside whiteboard/test-runner.

**Stays as-is from v1 work:**
- `@conciv/protocol/terminal-types`: `TtyCommand` (+`unsetEnvPrefixes`), `TtyCommandOpts`; harness adapter fields `tty`/`release`.
- `packages/harness/src/claude/tty.ts` incl. nested-CLAUDE-env stripping (`CLAUDECODE`/`CLAUDE_CODE_*` markers suppress transcript persistence — proven empirically).
- `@conciv/ui-kit-terminal` package (model, primitives, styled) — pure UI kit, consumed by the extension.
- Core's session-store lift (`makeApp` owns the store, passes into chat routes).

**Removed from v1 work:**
- `packages/core/src/api/tty/*` and its registration in `app.ts` (moves to the extension).
- `packages/widget/src/chat/mode-toggle.tsx` (replaced by the core tab bar on ui-kit-system Tabs).
- `packages/widget/src/chat/terminal-view.tsx` (moves into the extension client).
- api-client `mode`/`setMode`/`ttyUrl` (extension builds its own `/api/ext/terminal/…` URLs from the host `client`).
- The `terminal-header` `ExtensionSlot` (cross-extension composition inside another extension's view is out of scope).

## Panel views (extension API growth)

- `ExtensionMeta` grows `views?: readonly ExtensionView[]`;
  `ExtensionView = {id: string; label: string; icon?: Component; Component: Component}`.
- The widget collects views from all mounted extensions. With zero contributed views the panel renders exactly as today (no tab bar).
- Tab bar: `Tabs.Root value={activeView} onValueChange` + `Tabs.List/Trigger/Indicator` from ui-kit-system — indicator slides between triggers.
- Busy gating: leaving Chat is disabled while a chat turn runs; leaving a view is disabled while that view holds a lock. `ExtensionHostContext` grows `view: {setLocked(locked: boolean): void}` (no-op outside view rendering).
- Returning to the Chat tab re-fetches history (generic rehydration — any view may have advanced the conversation).
- Active view resets to Chat per session load; a view whose extension disappears falls back to Chat.

## Terminal view lifecycle (amended 2026-07-04: pty keeps alive across tab switches)

- Tab → terminal: view mounts → `POST open` (idempotent — a live pty is reused with an instant replay repaint; spinner while pending; 409 → toast + error banner with retry) → WS connect → replay repaints.
- Tab → chat: guarded by lock (busy frames from OSC 9;4); view unmounts → WS disconnects only, the pty stays alive → chat rehydrates via history refetch.
- Chat turn: core fires `sessions.onChatTurn(sessionId)` at turn start; the extension kills that session's pty first, so a chat claude and a pty claude never share the transcript.
- pty crash/exit: exit/error control frame → banner state from v1 mockup ("Back to chat" action switches tabs via `view.leave()`).
- Abandoned pty: no sinks + not busy → 5-min idle evict unchanged.

## Testing

- Extension package tests: pty service + routes ITs move from `packages/core/test/api/tty-*` and re-target the extension sub-app (real bash adapter surface, real WS).
- `ui-kit-terminal` package tests unchanged.
- Widget IT: tabs appear only when a view-contributing extension is mounted; terminal tab full loop (real claude): open → TUI → turn → back → rehydrated chat; indicator element present across switches (one indicator node, not per-tab).
- Example app registers the builtin, so the live dev loop stays the demo path.

## Out of scope

- Other harness tty descriptors (codex/gemini/opencode/pi) — same as v1.
- Cross-extension slots inside views.
- Persisting the active view across widget reloads.
