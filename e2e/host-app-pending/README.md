# Host app pending

Seven browser tests that need the real engine and the real widget, or a real pty, so they cannot run on the fake
engine. They wait here, unrun, for the e2e host app that installs the packed widget and plugins. No package runs this
folder: it holds no `package.json`, so the `e2e/*` workspace glob does not pick it up. The files keep the steps they
had in their packages, on the current test utils: the engine comes from the `createEngine` fixture of
`@conciv/backend-test-utils` and the app from `renderTestApp` of `@internal/frontend-test-utils/app`. `renderTestApp`
binds a fake engine only, so the host app supplies the real engine and the packed widget when it adopts them.

| Test                                                                                                                                                              | File                    | Came from                                                  | Why it needs the host app                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| the TanStack tab list names the focused tab                                                                                                                       | `tanstack.e2e.test.tsx` | `packages/plugins/tanstack/test/e2e/tanstack.e2e.test.tsx` | the engine's `tanstack_tabs_list` tool asks the real widget's page |
| a visitor starts the engine beside one paired to another visitor, sees Agent connected, and the widget binds, trusted, to a session that greets them as connected | `connect.e2e.test.tsx`  | `packages/plugins/try-it/test/e2e/connect.e2e.test.tsx`    | real engines on the connect ports and the real widget probing them |
| an engine already running on a connect port binds the widget at once, with no connect steps on screen, and the session greets the user as connected               | `connect.e2e.test.tsx`  | `packages/plugins/try-it/test/e2e/connect.e2e.test.tsx`    | a real engine on a connect port and the real widget probing it     |
| the CLI starts on first open, is locked and interrupted while busy, restarts fresh, and replays after a reload                                                    | `terminal.e2e.test.tsx` | `packages/plugins/terminal/test/e2e/terminal.e2e.test.tsx` | a real pty running a shell in the engine                           |
| a picked CLI model restarts the pty, is the default for the next session, and stays with the session it was picked in                                             | `terminal.e2e.test.tsx` | `packages/plugins/terminal/test/e2e/terminal.e2e.test.tsx` | a real pty running a shell in the engine                           |
| a press on the terminal toolbar leaves focus in the terminal, and the next keys still reach the CLI                                                               | `terminal.e2e.test.tsx` | `packages/plugins/terminal/test/e2e/terminal.e2e.test.tsx` | a real pty running a shell in the engine                           |
| a grab picked from the toolbar is held as a chip, pasted into the CLI on Enter and never sent to the chat, and Back to chat leaves an ended CLI                   | `terminal.e2e.test.tsx` | `packages/plugins/terminal/test/e2e/terminal.e2e.test.tsx` | a real pty, and the real page plugin's picker in the real widget   |
