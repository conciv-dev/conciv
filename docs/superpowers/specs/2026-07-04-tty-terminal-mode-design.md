# TTY Terminal Mode — Design

Date: 2026-07-04
Status: approved (brainstorm with user)
Mockup: `assets/2026-07-04-tty-terminal-mode-mockup.html` — **the approved visual reference; implementation must match it** (open in a browser to view the four panel states)

## Goal

Add a terminal mode to the widget chat: a header toggle switches the panel between the structured chat view and a live terminal rendering the exact TTY bytes of the harness CLI (claude first). Same conversation continues across the toggle in both directions.

## Decisions (user-confirmed)

- Toggle between chat and terminal in the existing widget chat panel; both are views of the **same conversation** (resume across modes).
- Claude first, plumbing generic: PTY/WS/xterm layer is harness-agnostic; per-harness resume wiring ships for claude only in v0. Other adapters opt in later.
- On terminal-to-chat switch, chat **rehydrates from the claude session JSONL** so terminal-era turns appear in the chat list.
- Toggle is **disabled while a turn is in flight** in either mode.
- New dependencies approved: `node-pty` (core), `@xterm/xterm` + fit addon (widget).
- Spike (2026-07-03, deleted) proved the pipeline: claude renders its full TUI under a pty, bytes stream to the browser, xterm renders them byte-exact, keystrokes flow back.

## Architecture

```
widget (xterm)  <==>  WS /api/tty?sessionId=...  <==>  core tty service (node-pty)  --spawns-->  claude --resume <id>
     ^ toggle                                              ^ command descriptor from
chat view  <==>  existing SSE/turn pipeline                  harness adapter.tty
```

`@conciv/harness` is a library inside the core process; adapters describe the CLI, core executes it.

### New pieces

- **protocol**: `HarnessTtyCommand = {bin, args, env}`; adapter capability `tty?: {command(opts: {cwd, sessionId, resumeSessionId?, model?}): HarnessTtyCommand}`.
- **harness/claude**: implements `tty.command`. Fresh session: `claude --session-id <uuid>` so core dictates session identity before any turn exists. Existing session: `claude --resume <id>`.
- **core `src/api/tty.ts`**: pty session registry `sessionId -> {pty, replayBuffer, sockets, busy}`; node-pty spawn with `TERM=xterm-256color`; WS route riding the existing crossws upgrade path and `originAllowed` check.
- **widget**: terminal view component (widget-local, not ui-kit-chat; promote only when a second consumer appears) + header segmented toggle.

### Wire protocol (single WS per session)

- down binary frame: raw pty output bytes; on connect the replay buffer is flushed first
- up binary frame: keystrokes (xterm `onData`, utf-8 encoded)
- text frame JSON control: client-to-server `{type:'resize', cols, rows}`; server-to-client `{type:'exit', code}` and `{type:'error', message}`

### Busy detection

- Chat side: core already tracks the in-flight turn.
- Terminal side: incremental scan of the pty stream for OSC `9;4` progress sequences (Claude Code emits them; observed in the spike). Progress active = busy. If no OSC `9;4` is ever seen (older CLI), the guard stays inactive and the toggle remains enabled.

## Mode switching

- REST `POST /api/chat/:sessionId/mode` with `{mode: 'chat' | 'terminal'}`. Rejected with 409 while busy.
- chat -> terminal: require idle; evict the SDK warm session; spawn pty via the adapter descriptor; record the chat-side high-water mark (last message id the chat view has).
- terminal -> chat: require idle (OSC guard); kill pty; read the claude session JSONL (`~/.claude/projects/<cwd-munged>/<sessionId>.jsonl`), decode entries past the high-water mark via the existing `claudeMessagesToAgui` path, return `{messages}`; widget appends them. Next chat turn resumes via `resumeSessionId` as today.
- Mode persists per session server-side; reopening the widget in terminal mode reconnects and the replay buffer repaints the screen.

## UI (match the mockup)

Four states, exactly as in `assets/2026-07-04-tty-terminal-mode-mockup.html`:

1. **Chat mode**: today's view plus a segmented control in the panel header: `[ Chat | >_ Terminal ]`, chat active.
2. **Terminal mode**: the panel body is the terminal, full-bleed; message list and composer are gone; the TUI owns input, spinners, and approval prompts. xterm + fit addon; ResizeObserver drives `resize` frames.
3. **Busy**: segmented control greyed with tooltip "finishing current turn..."; re-enables when idle.
4. **Exited** (user typed `/exit`, process died): terminal frozen at reduced opacity, banner "Terminal session ended" + "Back to chat" button. No auto-switch.

Details:

- Theme: xterm needs concrete colors; read widget theme tokens with `getComputedStyle` at mount, build the xterm theme (bg, fg, 16 ANSI, cursor, selection); re-read on theme change. Widget mono stack, 13px.
- xterm CSS is injected into the widget shadow root.
- Transitions follow the settled-state motion rule: brief spinner while the pty spawns or the transcript rehydrates, single fade when content lands, no idle animation.

## Error handling

- pty spawn failure or invalid resume id: `{type:'error'}` frame, widget banner, auto-return to chat.
- WS drop: widget reconnects; replay buffer repaints. The pty survives disconnects and is evicted after 5 minutes with no sockets while idle (mirrors the SDK warm-session `IDLE_EVICT_MS`).
- core restart kills ptys; the widget sees the WS close and shows the exit banner.
- Replay buffer capped at 4MB, trimmed from the front; xterm scrollback 5000 lines.
- Security: WS upgrade reuses `originAllowed`; the spawned binary comes only from the adapter descriptor; the session id is validated against live sessions. Clients can never choose the command.

## Testing

- **core IT**: tty service against real `bash` under a real pty and a real WS client — stream, input echo, resize, replay-on-reconnect, idle evict.
- **harness**: claude `tty.command` arg construction (`--resume`, `--session-id`, env).
- **widget IT** (playwright, `browser.newPage()`, live core + real claude): toggle to terminal, TUI appears, run a turn in the terminal, toggle back, the terminal-era message shows in chat. xterm renders to canvas, so terminal assertions read the xterm buffer via `page.evaluate` (observable content, not implementation detail).

## Out of scope (v0)

- Terminal mode for codex/gemini-cli/opencode/pi (plumbing ready; descriptors later).
- Multi-viewer size negotiation: single canonical size, last resize wins.
- Session restore across core restarts.
