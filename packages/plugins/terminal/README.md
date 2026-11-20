# @conciv/plugin-terminal

Private. The browser part of the session's CLI terminal, built in and always on (id `terminal`). The app lists its
`./client` default export in `apps/conciv/src/runtime/plugin/builtins.ts`; the embed bundles it into the published
widget. The shell process stays in core (`packages/core/src/pty`), reached over `experimental.persistentPty`.

- A pinned Terminal tab in the session's pane, listed for a session whose harness has a terminal. The CLI starts only
  when the tab first opens (the xterm surface loads then too) and is replayed after a reload.
- A toolbar at the top of the panel picks the CLI model and starts a new terminal, both locked while the CLI is busy.
- Escape with focus in the terminal interrupts a busy CLI; keys pressed on the host page stay there.
- Invariant: the `prefs` store (the chosen model, the CLI session per conciv session) is declared on the default export
  and keyed by the id `terminal`, so the id keeps users' saved prefs.
- Side effects: opens one persistent pty per session on the engine's rpc socket and removes it on restart; prunes the
  saved CLI session of a deleted conciv session.
