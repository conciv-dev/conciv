# Terminal View Augmentation — Design

Date: 2026-07-04
Status: implemented (plan `docs/superpowers/plans/2026-07-04-terminal-view-augmentation.md`; note: "new session" follows shell pane semantics — fresh pane opens in chat view; the same-pane respawn path is exercised by the model chip)
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
  `Terminal.Overlay anchor="rail" | "top-right"` — DOM zones positioned beside/over the grid. First consumer: the mirror pane (`rail`).
- Overlays are **never line-anchored** (the TUI repaints constantly; buffer anchors churn). Zones are viewport-stable.
- Overlays render arbitrary Solid components; the grid underneath stays untouched.
- The grab tray deliberately does not use this layer — it is widget chrome above the view body (section 4).

### 4. Grab tray

- Verified in code: the pick overlay and `stageGrab` live at shell level, and ChatPanel (owner of the `grabs` signal) stays mounted while a view is active — staging already works during terminal view, the cards are just not rendered anywhere visible.
- The tray is **widget-owned chrome**, not part of the terminal extension: when a view is active and grabs exist, ChatPanel renders the same `GrabReference` cards in a strip above the view body. Identical component and styling to chat; `GrabReference` stays widget-internal.
- Insert routing: `ExtensionHostContext.view` grows `onInsert(handler: (text: string) => void)`. The terminal view registers a handler that writes `grab.text` to the pty as a bracketed paste (stdin — always safe, no frame concerns). The card's Insert button calls the active view's handler and removes the grab; with no handler registered, no Insert button renders.
- Chat parity check: chat mode joins `grab.text` with the typed message (`chat-panel.tsx onSend`); the terminal path delivers the identical text — the TUI echoes it into the prompt.

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

## Verified by spike (2026-07-04, real claude v2.1.201 in a pty)

- Claude wraps every TUI repaint in synchronized-update markers (`ESC[?2026h` / `ESC[?2026l`; 86 balanced pairs in one short session). The injector's frame tracking is grounded, with OSC 9;4 idle as the preferred flush point.
- Transcript JSONL grows **incrementally during a turn** (4 of 5 growth events observed mid-turn), so the mirror pane can render tool cards live, not just per-turn.
- `--resume <token> --model <other>` composes: the session resumed under the new model with full conversation memory intact. Model-chip respawn is safe.

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
