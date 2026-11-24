# @conciv/plugin-terminal

The browser part of the session's CLI terminal, a served plugin with only a `./plugin-experimental` (built with the
SDK's `experimental()`). The dev server (`@conciv/unplugin` `core/boot.ts` `withServedBuiltIns`) lists its package
folder in every engine's plugins, so the engine serves it and its id is the package name. The shell process stays in
core (`packages/core/src/pty`), reached over `experimental.persistentPty`.

- A pinned Terminal tab in the session's pane, listed for a session whose harness has a terminal. The CLI starts only
  when the tab first opens (the xterm surface loads then too) and is replayed after a reload.
- A toolbar at the top of the panel picks the CLI model and starts a new terminal, both locked while the CLI is busy.
- Escape with focus in the terminal interrupts a busy CLI; keys pressed on the host page stay there.
- Invariant: the `prefs` store (the chosen model, the CLI session per conciv session) is declared on the default export
  and keyed by the plugin id `@conciv/plugin-terminal`.
- Side effects: opens one persistent pty per session on the engine's rpc socket and removes it on restart; prunes the
  saved CLI session of a deleted conciv session.
