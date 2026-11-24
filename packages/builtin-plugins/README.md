# @internal/builtin-plugins

Private, never published: the browser halves of conciv's built-in plugins, compiled into the app (and with it into
`@conciv/embed`), as opencode's `@opencode/gui-plugins`. One folder per built-in, each with its window entry
`renderer.tsx`. `src/renderer.ts` (`./renderer`) is the only place that names the built-ins: `builtins`, the
`compose({...})` list the app lists before any served plugin, each entry carrying `engineHalf`, whether the engine
serves a half under the same id.

## terminal

The session's CLI terminal, id `terminal`, no engine half. The shell process stays in core (`packages/core/src/pty`),
reached over `experimental.persistentPty`.

- A pinned Terminal tab in the session's pane, listed for a session whose harness has a terminal. The CLI starts only
  when the tab first opens (the xterm surface loads then too) and is replayed after a reload.
- A toolbar at the top of the panel picks the CLI model and starts a new terminal, both locked while the CLI is busy.
- Escape with focus in the terminal interrupts a busy CLI; keys pressed on the host page stay there.
- Invariant: the `prefs` store (the chosen model, the CLI session per conciv session) is declared on the default export
  of `terminal/renderer.tsx` and keyed by the plugin id `terminal`.
- Side effects: opens one persistent pty per session on the engine's rpc socket and removes it on restart; prunes the
  saved CLI session of a deleted conciv session.

## page

The page plugin's browser half, id `conciv.page`, the same id as its engine half (`@conciv/plugin-page`), so a
`-conciv.page` config entry turns both off: the app disables this half when the engine lists no `conciv.page`, and
hands it the options of a `['conciv.page', {...}]` entry from the engine's listing. It imports only the engine
package's pure `./rpc` and `./contract`, and draws with the UI kits directly. Its behaviour, cards, invariants and side
effects are documented with the engine half in `packages/plugins/page/README.md`.

## Verification

- `pnpm exec turbo run test --filter=@internal/builtin-plugins`: the page plugin's browser test on the light kit's fake
  shell, with page's engine half in `pluginEngine`, and the node tests of its attachment, sanitizer and grab labels.
- The terminal's journeys, and page's real-app journeys, run in `apps/conciv`'s browser tests.
