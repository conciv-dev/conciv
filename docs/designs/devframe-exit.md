# Leaving the Devframe migration: what we keep, and how

Status: draft, 2026-11-03. Owner decisions recorded inline.

## Why

The Devframe migration (closed PRs #691 to #709) added about 12,000 lines and deleted none, because the old
oRPC path had to run next to the hub until the last step. Hands-on testing of the stack top found:

- Devframe's Messages view laid out wrong inside conciv's panel;
- typing in its Terminals view did nothing, and the terminal could not be focused again;
- switching view tabs was slow;
- Terminal and Terminals sat side by side.

Devframe also assumes one hub per page: one global connection and one stored login token. In the Vite
DevTools dock, conciv's hub and the DevTools hub overwrote each other. Trust had to be read through Devframe
internals (`devframe/node/hub-internals`), not its public API.

Decision (Omri, 2026-11-03): close the stack and keep only the pieces that stand on their own, each as a
small PR off `main`. The branches stay on the remote as reference; nothing is merged from them wholesale.

`main` already shows conciv as a Vite DevTools dock entry (#649) without Devframe, so the dock is not lost.

## Rules for every piece

- Its own branch off `main`, its own PR, its own changeset. No stacking.
- Port behaviour, not code: the stack's code was written against the hub. Rewrite against `main`'s plumbing
  (oRPC, Hono routes). Copy only files that have no Devframe import.
- No Devframe dependency anywhere on `main`.
- Test files stay at or under 1000 lines, by deleting useless tests and duplicates, never by splitting.
  No hacks: no sleeps, retries, longer timeouts, test-only switches, casts or swallowed errors.
  Any exception goes to Omri.
- No test overrides: tests get a valid login from the harness testkit, the same way a user would.
- No raw `createEffect` / `createSignal`.
- Before a URL goes to Omri, every view is used by hand on both the page surface and the dock: each tab
  opened and screenshotted, every input typed into, focus moved away and back, tab switches timed, page reloaded.

## Piece 1: browser login (#648)

The spec is issue #648. Decision (Omri, 2026-11-03): **our own implementation (option A)**, about 150 lines
in core, with no Devframe package. The stack's version used Devframe's `interactive-auth`; we keep its
behaviour and drop the dependency.

### Engine (packages/core)

- **Code store.** One function module:
  - a 6-digit code;
  - lives 5 minutes;
  - compared in constant time (`crypto.timingSafeEqual`);
  - rotates after a successful exchange, after 5 failed tries, and on re-issue.

  Asking for a code without `reissue` returns the current one and prints nothing new.

- **Trust store.** A JSON file in the engine state dir, not the SQLite db, so wiping the db does not log
  browsers out. One entry per token: browser description, origin, time granted. Written atomically
  (write to a temp file, then rename).
- **Banner.** Printed in the engine terminal when a code is asked for. It shows:
  - the code;
  - the magic link `http://127.0.0.1:<port>/#conciv_otp=<code>`, carried in the fragment so it never
    reaches logs or `Referer`;
  - the expiry time;
  - the browser and origin asking.

  Same box style as the "listening on" line.

- **Gate.** One Hono middleware in front of every route. Open routes, served with no token:
  - `/health`;
  - the three login routes;
  - the native page.

  Everything else needs a trusted token, sent as a `/t/<token>` prefix, or
  `Authorization: Bearer` on HTTP and on the websocket upgrade. The existing `accessToken` pairing token
  counts as trusted, and so does the token harness children get in env. The stack's `engine-gate.ts` is
  the shape to follow, without `hub`.

- **Login routes**, zod-validated as plain Hono routes, so they work before oRPC is reachable:
  - `POST /auth/check {token}` returns `{trusted}`;
  - `POST /auth/code {reissue?}` prints the banner;
  - `POST /auth/exchange {code}` returns `{token}` or a 401 with the reason.
- **Revoke.** `conciv auth revoke [--all]` in the CLI.

### Widget (apps/conciv, embed, ui-kit-system)

The behaviour Omri already approved on the stack carries over unchanged:

- On load, nothing pops up. The widget asks the backend whether its stored token is still trusted. A
  token sitting in storage proves nothing.
- Phases are `checking`, `unreachable`, `locked`, `exchanging` and `trusted`, held in a resource (no
  effects).
- While locked, the launcher shows a lock. Every way of opening the panel (launcher click, keyboard
  shortcut, command, open-on-load) goes through one gate, which queues the open and shows the dialog.
- The dialog is the kit Dialog, which Escape and the close button dismiss, with an Ark `PinInput`. It has
  "Send a new code", and an error row reserved in the layout so a notice never shifts it. A wrong code
  marks the boxes invalid and clears them through zag's `clearValue`.
- The magic link `#conciv_otp=` logs in on load and is removed from the URL.
- Unreachable engine: the panel opens and shows the existing error screen, not the login.
- Files to port: `packages/ui-kit-system/src/pin-input.tsx` (no Devframe import, copy as is), and the
  login parts of `apps/conciv/src/app/devframe-link.tsx` and `routes/__root.tsx` from `devframe-login`,
  rewritten on fetch.

### Tests

- Core node test (existing file): code expiry, rotation after 5 failures, rotation on success and
  re-issue, trust file survives restart, and the gate refuses then accepts.
- Widget browser test (existing file): locked launcher, dialog dismiss, wrong code, right code, magic
  link, stale token rejected by the backend, unreachable engine.
- The harness testkit gives test pages a trusted token through the real exchange. No bypass flag.

### Inside the Vite DevTools dock: one login (decided 2026-11-04)

A browser logged in to Vite DevTools gets a conciv token without a second code, through public API only.
Proved on spike branch `spike/dock-trust` (never merged):

- conciv's existing `devtools.setup(context)` registers `conciv:engine-token` with `context.rpc.register`.
  The Devframe hub inside Vite DevTools serves a method without the `anonymous:` prefix only to a trusted
  connection (documented rule, `devframe/src/constants.ts` `ANONYMOUS_RPC_PREFIX`), so reaching the handler
  is the proof of DevTools login.
- The handler mints a conciv token, writes it to conciv's own trust file with "via Vite DevTools" as the
  browser description, and returns it.
- The dock renderer calls it through the `context.rpc` it already receives (`DockClientScriptContext`),
  stores the token like a code login would, and is trusted.
- Before login, DevTools does not show the dock list at all, so the dock never runs untrusted.
- Imports: none beyond `node:crypto`; no `hub-internals`, no DevTools trust files.
- The spike's refusal evidence came from the client refusing its own call. The production test must also
  send the call over a raw WebSocket before login and assert the server refuses it.
- Revoking the DevTools login does not revoke the conciv token; `conciv auth revoke` does.

## Piece 2: Playwright report from a file

Stack commit `c6c210f28`. The test runner reads Playwright's JSON report from stdout, and on GitHub Actions
Playwright's git-info plugin prints a timeout line into stdout, which breaks the parse. Fix: set
`PLAYWRIGHT_JSON_OUTPUT_FILE` to a temp file and read that.

- File: `packages/extensions/test-runner/src/runners/playwright/run-child.ts`.
- Test: in `test-runner.it.test.ts`, the fixture config logs to stdout and the report still parses.

## Piece 3: status bar view tabs

Stack commits `046463ac4`, `7107e4f20`, `b2149bc98`, `dda735a0c` and `13ecf57c9`:

- tabs scroll inside their own row when they outgrow the panel;
- the scrollbar is hidden and named;
- the selected tab scrolls into view after any navigation, from a `router.subscribe('onRendered')`
  registered in the list's ref with `onCleanup`;
- stories render inside a memory-history router.

No Devframe code involved, but these were written beside Devframe's docks; recheck each against `main`.

## Piece 4: small fixes

Each needs to be confirmed as a bug on `main` before it is ported. Drop any that only mattered for the hub.

| Commit      | Fix                                                                       | Check on `main`                                     |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `6e4761b3a` | Connection listeners are notified from a snapshot of the set.             | Does any listener unsubscribe while being notified? |
| `e2cb56f23` | The session list is published one write at a time and on every chat turn. | Does the session list on `main` miss turns?         |
| `daee2c4f9` | The chat schemas and error maps are named in the contract.                |                                                     |
| `922e4b33e` | The fault test no longer replaces the global `setImmediate`.              | Does that test exist on `main`?                     |

## Piece 5: view tabs during a turn

Decision (Omri, 2026-11-03): the tabs stay clickable while the agent runs. In progress on branch
`view-switch-during-turn`. Before unlocking, it finds why #559 locked them and fixes any loss or
duplication of the reply on return.

## Piece 6: tab switching speed

Measure on `main` first: the time from click to content, long tasks, requests and iframe loads, per tab,
median and p95. Fix only what the numbers show. The Devframe-specific candidates (plugin iframes,
reconnects) are gone with the stack.

## Piece 7: test files at most 1000 lines on `main`

Audit every test file over 1000 lines on `main`:

| File                             | Lines |
| -------------------------------- | ----- |
| `cli.test.ts`                    | 3,851 |
| `core-api.it.test.ts`            | 2,812 |
| `conciv.browser.test.tsx`        | 1,729 |
| `embed.it.test.ts`               | 1,675 |
| `plugin.it.test.ts`              | 1,616 |
| `design.it.test.ts`              | 1,346 |
| `recorder.test.ts`               | 1,245 |
| `ui-kit-system.browser.test.tsx` | 1,034 |

The rules are the ones in the "Rules for every piece" section above. Each delete names its covering test
and quotes the assertion, and Fable greps each proof before accepting it. Exceptions go to Omri. Leave the
design x-ray tests alone.

## Order

1. Piece 2 and Piece 5, both small and independent.
2. Piece 7, the audit, which is read-only until approved.
3. Piece 1.
4. Pieces 3, 4 and 6.

## Not kept

These go with the stack; the branches remain for reference:

- the hub;
- `defineConcivPlugin`;
- the Devframe Terminals and Messages views;
- the command palette and toasts built on Devframe docks;
- the hub-function ports of every procedure group;
- the Devframe test helpers (`devframe-probe`, `devframe-mounts`, `devframe-faults`).
