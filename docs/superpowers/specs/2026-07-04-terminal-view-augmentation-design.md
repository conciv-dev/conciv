# Terminal View Augmentation — Design

Date: 2026-07-04
Status: approved (brainstorm with user, mockup-driven)
Builds on: `2026-07-04-terminal-extension-design.md` (the terminal extension itself). This spec covers what comes next: composer-action parity in the terminal view plus web-side augmentation of the TTY claude.

## Goal

Every chat-composer capability gets a working home in the terminal view, and the web surroundings actively make the TTY claude better: page tools, rich HTML rendering beside the raw TUI, and a safe way to put our own content both around and inside the terminal output.

## Decisions (brainstormed)

- Actions live on the **right side of the existing tab-bar row** (mockup option A). No new rows, no floating menus.
- Session selector stays in the widget header (already visible in terminal view) and becomes terminal-aware.
- Compact button: **out of scope** — the TUI's native `/compact` covers it.
- `/` and `@` trigger menus: **nothing to build** — the TUI has its own native menu.
- Rendering our own content uses **two tiers behind one API**, both shipped in v1:
  - Tier 1 — server-side ANSI stream injection (native terminal lines, scroll with history, replay-consistent).
  - Tier 2 — HTML overlay zones around/over the grid (chat-widget-quality rendering, interactive).
- `pretext` (text layout library) evaluated and rejected: xterm lays out grid text, the DOM lays out HTML — no gap for it to fill.

## Architecture

Six units. Each is independently buildable and testable.

### 1. Action row — `ExtensionView.actions`

- `ExtensionView` (extension API) grows `actions?: Component`. The widget renders the active view's actions right-aligned inside the tab-bar row.
- The terminal view contributes three controls: **model chip · new session · open externally**.
- All three ride one shared client helper `respawn(opts: {sessionId?: string; model?: string})`:
  close pty (`POST close`) → optionally resolve a fresh session → `POST open` with `{cols, rows, model}` → WS reconnect + replay.
- `POST /api/ext/terminal/open` accepts an optional `model` and forwards it to `harness.ttyCommand` (`TtyCommandOpts.model` already exists).
- Model chip: reuses `ModelSelector` from `@conciv/ui-kit-chat`; shows the model the pty was spawned with; picking a different model runs `respawn({model})` (resume token preserves the conversation). The persisted composer model selection (`pw-conciv-model`) seeds the initial spawn so chat and terminal agree.
- New session: `respawn({sessionId: fresh})` via `client.resolve()`.
- Open externally: close pty first (session is single-pty), then existing `client.launch({model})`, same clipboard-fallback UX as the chat action.
- Busy gating: all actions disabled while the view lock is held (OSC 9;4 busy).
- Session pill: switching sessions while the terminal view is active runs `respawn({sessionId: target})` instead of the chat-only load path; blocked by the same busy lock.

### 2. MCP parity for the TTY claude

- `claudeTtyCommand` (packages/harness/src/claude/tty.ts) appends the same MCP args chat mode builds in `packages/harness/src/claude/args.ts`: `--mcp-config {conciv server} --strict-mcp-config`, with the session-id header wired so tools land in the right session.
- `TtyCommandOpts` grows whatever the args builder needs (mcp url) — plumbed from the extension server through `harness.ttyCommand`.
- Result: terminal claude gets conciv page tools; highlights/edits/effects render live in the host page while the user watches the TUI.

### 3. Overlay layer (tier 2)

- `@conciv/ui-kit-terminal` grows compound primitives:
  `Terminal.Overlay anchor="above-prompt" | "rail" | "top-right"` — DOM zones positioned around/over the grid.
- Overlays are **never line-anchored** (the TUI repaints constantly; buffer anchors churn). Zones are viewport-stable.
- Overlays render arbitrary Solid components; the grid underneath stays untouched.

### 4. Grab tray

- The page element picker stays active while the terminal view is shown.
- `ExtensionHostContext` exposes grab staging to views (same `GrabApi` the chat panel uses).
- Staged grabs render as the existing `GrabReference` preview cards inside the `above-prompt` overlay.
- **Insert** writes `grab.text` to the pty as a bracketed paste (stdin — always safe, no frame concerns). The TUI echoes it into the prompt; claude receives exactly what chat mode would have prepended.
- Chat parity check: chat mode joins `grab.text` with the typed message (`chat-panel.tsx onSend`); the terminal path delivers the identical text.

### 5. Stream injection (tier 1)

- The extension server relay gains a single `writeToClient(bytes)` chokepoint — every client-bound byte (pty output, replay, injections) flows through it.
- Injections queue and flush only at **frame-safe points**:
  - never inside a synchronized-update frame (track `ESC[?2026h` / `ESC[?2026l`),
  - preferring OSC 9;4 idle (the busy tracker already parses it).
- Injected bytes are recorded into the replay buffer → reconnects repaint them, they scroll with history, and terminal selection copies them.
- Client API: `model.inject({ansi: string})` sends a WS control frame; the server validates and enqueues. The server also self-injects notices: session switched, pty exit reason, resumed marker.
- Injection payloads are ANSI text only; no cursor-movement sequences accepted (keeps injected content strictly appended lines, immune to layout races).

### 6. Rich mirror pane

- Harness surface grows a transcript tail: `harness.transcriptTail?(token): AsyncIterable<entry>` — the harness owns the file watch and reuses the **same JSONL parser the history endpoint uses**. No second parser, and the extension never touches transcript files directly.
- Extension server route `GET /api/ext/terminal/mirror` streams parsed entries over SSE (one-way flow; matches the chat transport) for the live pty session, re-emitting as the transcript grows.
- Client: a collapsible `rail` overlay renders entries read-only with the existing `@conciv/ui-kit-chat` message primitives and `@conciv/ui-kit-chat-tools` tool cards — the exact renderers chat uses, so tool calls, diffs, and images appear chat-quality beside the raw TUI.
- Mirror is display-only in v1: no approvals, no sending from the rail.

## Error handling

- `respawn` failure: error banner in the terminal body (existing pattern) + retry; the previous pty is already closed, so retry reopens.
- Mirror stream drop: rail shows a reconnect state and resumes from the last seen line (byte offset or line count cursor).
- Injection while disconnected: queue flushes on reconnect after replay.
- Grab insert while pty dead: notify via existing `ctx.notify`, keep the grab staged.

## Testing

- Injector unit tests: synthetic ANSI streams — mid-frame injection deferred, back-to-back frames, idle flush, replay buffer contents, reconnect repaint.
- Extension ITs (real bash/claude adapter, real WS): respawn routes (model change, session change), mirror stream over a real claude transcript, MCP args present in spawn.
- Widget IT (real claude): grab → insert → prompt contains grab text → turn completes; model switch respawns and resumes; mirror rail shows tool card during a live turn.
- ui-kit-terminal: overlay primitive tests (zones render, no interference with grid), model.inject control-frame test.

## Out of scope

- Compact button (native `/compact` suffices).
- Extension-contributed composer surfaces inside the terminal action row.
- xterm link provider, selection bubbles, scrollback search, custom hotkeys (parked — none selected).
- Approvals or composing from the mirror rail.
- Persisting overlay/rail collapsed state across reloads.
