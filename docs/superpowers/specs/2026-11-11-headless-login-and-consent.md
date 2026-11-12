# Headless login and outside-agent consent

Status: Parts 1, 2 and 3 approved for build.
Date: 2026-11-11. Source read at `origin/main` `bd47e7526`. All `file:line` references are to that commit.

## The ask

> "a way to skip the Allow Claude flow using a token so tests or playwright cli runs can just pass a token and allow it to skip the allow"

Today a headless design run needs a human (or a script clicking in the page) three times: to authorize the browser tab, to click Allow for the outside agent, and to click Approve on each tool that asks.

## What exists today

### The gates, end to end

An outside agent reaches core over HTTP (the `conciv` CLI, `conciv mcp serve`) or through the Claude plugin bridge (stdio to `POST /api/mcp`). A headless tab reaches core over the RPC WebSocket. Each passes these gates in order.

| #   | Gate                                             | Where                                                                                                                                                      | Keys on                                                                                                                                                                                                                                                                                                                                                                 | Who can satisfy it today                                                         |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Host and origin                                  | `packages/core/src/lib/cors.ts:55-76`, `packages/core/src/api/mcp.ts:352`                                                                                  | `Host` must be loopback; `Origin`, when sent, must be loopback or in `allowedOrigins`                                                                                                                                                                                                                                                                                   | Anything on the machine                                                          |
| 2   | Engine trust (transport)                         | `makeEngineGate` `packages/core/src/engine-login.ts:370-389`; sockets `rpcSocketGate` `:263-296`                                                           | A token in `/t/<token>/...` or `Authorization: Bearer`. Trusted when it equals the engine token or hashes to a row in `.conciv/trusted-browsers.json` (`makeConnectionTrust` `:193-200`)                                                                                                                                                                                | CLI and bridge: the engine token. Browser: a browser token from the 6-digit code |
| 3   | Browser authorization                            | `auth.requestCode` / `auth.exchange` `engine-login.ts:305-328`; code store `:85-114`; banner with the `#conciv_otp=` link `:75-83`                         | A 6-digit code printed in the dev server terminal, 5 minute life, 5 wrong tries. Exchange writes a new browser token (`grantBrowser` `packages/protocol/src/engine-trust.ts:67-75`)                                                                                                                                                                                     | A human who can read the terminal                                                |
| 4   | Agent connected                                  | `hub.refusal` `packages/harness-init/src/hub.ts:84-93`, called from `packages/core/src/api/rpc/mount.ts:99-104,115` and `packages/core/src/api/mcp.ts:296` | The self-declared `conciv-client` header naming a harness that is not in the home db's connections                                                                                                                                                                                                                                                                      | `conciv mcp connect <agent>` or the widget                                       |
| 5   | Allow (outside agent may act on this session)    | `admitOutside` `packages/core/src/app.ts:605-620`, called from `admitHubCaller` `mount.ts:106-117` and MCP `sessionTools` `mcp.ts:294-299`                 | Runs only when the caller sent `conciv-origin: hub` (`callTrace` `packages/core/src/api/call-trace.ts:65-72`). Skipped when `hubAccess` is `'open'` (`app.ts:610`). Otherwise a grant per session, or per project when `hubAccess: 'project'` (`packages/chat/src/approvals.ts:99,135-147,213-222`), revoked when the hub generation changes. Waits 50 s (`app.ts:303`) | A click in the widget, or `hubAccess: 'open'`                                    |
| 6   | Approve (per call, tools with `approval: 'ask'`) | `refuseUnapproved` `packages/core/src/api/rpc/router.ts:65-72` -> `plane.admitCall` `packages/chat/src/index.ts:146-168`                                   | Skipped when the request carries a loopback `Origin` header (`widgetCaller` `cors.ts:28-30`), which is how the widget's own calls pass. Otherwise a grant per session and tool: once, or "Allow for session" (`approvals.ts:163-172`)                                                                                                                                   | A click in the widget                                                            |
| 7   | Outside agents cannot answer their own prompts   | `refuseOutside` `mount.ts:99-104`                                                                                                                          | `conciv-origin: hub` on `chat.permissionDecision` / `chat.allowOutside`                                                                                                                                                                                                                                                                                                 | Not satisfiable by design                                                        |

`hubAccess` is `'open' | 'session' | 'project'` (`packages/protocol/src/chat-types.ts:24`). On main it defaults to `'open'` (`packages/core/src/config.ts:70`, since #805), so gate 5 is already off by default on main. The `design-catalog` branch still carries the older default `'session'`, which is why design runs there see "Allow claude".

### What the engine token already is

The engine token (the UUID in `.conciv/server.json` and inside the URL in `.conciv/mcp-endpoint.json`, both mode `0600`; minted at `packages/core/src/start.ts:184`, handed to harness children as `CONCIV_TOKEN` at `:188`) is full transport trust. Three consequences matter for this design:

1. **It authorizes a browser too.** `auth.trust` accepts any token `trusts()` accepts, and that includes the engine token (`engine-login.ts:194,312-316`). The widget presents whatever sits in `localStorage['conciv:engine-token:<apiBase>']` before it asks for a code (`packages/contract/src/browser-transport.ts:39,350-356`). A widget whose `apiBase` contains `/t/<token>` uses that token directly (`packages/embed/src/agent-base.ts:5-10`). The Vite DevTools dock already mints a browser token with no code at all (`packages/plugin/src/core/vite.ts:179-188`).
2. **It can answer every prompt.** `chat.permissionDecision` and `chat.allowOutside` are ordinary RPC procedures. Gate 7 refuses them only when the caller labels itself `conciv-origin: hub`. A caller holding the engine token and not sending that header is treated as the tab's user.
3. **Gates 5 and 6 key on headers the caller chooses.** Leaving out `conciv-origin` skips Allow. Sending `Origin: http://localhost` skips Approve.

So Allow and Approve are not a security boundary against a process that holds the engine token. They are a guardrail for well-behaved agent tooling (our CLI and bridge always label themselves) so the human sees and controls what an agent does in their tab. A consent token therefore does not widen what the machine's processes can do. Its job is to make "this run is unattended, do not ask" an explicit, supported, visible state instead of header tricks.

### How tests do it today

No test bypasses consent in product code. They act as the user through the real RPC surface:

- **Allow and Approve.** A second RPC client with no hub header reads `chat.hydrate().pendingApprovals` and calls `chat.permissionDecision` (`approvePending`, `makeApprovingCallTool` in `packages/harness-testkit/src/call-tool.ts:173-190`; same pattern in `packages/cli/test/cli.test.ts:1150` and `packages/core/test/core-api.it.test.ts:4402`). `@conciv/extension-testkit` exposes it as `callToolApproved` (`packages/extension-testkit/src/get-extension-test-api.ts:64`).
- **Gate mode.** Kits boot with `hubAccess: 'session'` so the Allow path is exercised (`packages/extension-testkit/src/core-kit.ts:67`, `packages/core/test/helpers.ts:114`, `packages/cli/test/helpers.ts:35`).
- **Engine trust.** Node clients use the token-scoped base `/t/<agentToken>` (`packages/extension-testkit/src/boot-server.ts:35`, `packages/harness-testkit/src/create-testkit.ts:106-108`).
- **Browser authorization.** They scrape the printed `#conciv_otp=` code from the server's output and either open the magic link or exchange the code (`packages/harness-testkit/src/login.ts:4,34-45`, `e2e/e2e-utils/src/widget.ts:112-134`).

That works inside a test that owns the server process. It does not help `claude -p` or a `playwright-cli` session against a dev server, where nobody is positioned to answer prompts or read the terminal.

## Decision

Discussed with Omri on 2026-11-11. The token idea is dropped: both problems have a smaller answer.

1. **Browser login: `conciv auth link`.** Approved. Build it.
2. **Approve prompts for outside agents: remove them.** Approved.
3. **Allow prompt:** already off on main (`hubAccess` defaults to `'open'`). The `design-catalog` branch picks that up when it takes main.

With all three, a headless run is: start the dev server, `conciv auth link <page>`, open the link, run the agent. No clicks, no token to pass around, no log scraping.

## Part 1: `conciv auth link <page-url>` (approved)

### What it does

Prints a one-time login link for a page, for example `http://localhost:3001/#conciv_otp=123456`. Opening it in any browser logs that browser in, exactly as if the user had clicked "Authorize conciv" and typed the code from the terminal. The widget already handles that link (`apps/conciv/src/app/engine-login.tsx:75-80`), so the widget does not change.

The code is not tied to a browser when issued. The first browser to present it is logged in, and the engine records that browser at that moment (`engine-login.ts:298-303,317-323`). It then appears in `conciv auth revoke` like any other and can be revoked. Login is trust between one browser and one dev server, not per chat session.

### Why it is safe to hand the code to the CLI

`auth.requestCode` returns only the expiry (`packages/contract/src/contract.ts:214`) and prints the code to the dev server terminal, because its caller is the untrusted browser. The CLI is different: it already holds the engine token from `.conciv/server.json`, which is full trust in the engine. Giving that caller a code grants nothing it could not already do.

### Shape

- **Contract** (`packages/contract/src/contract.ts`, `auth`): one new procedure, `issueCode`, no input, output `{code, expiresAt}` with `code` matching `LOGIN_CODE_PATTERN`.
- **Core** (`packages/core/src/engine-login.ts`):
  - The code store gains `issue()`, which makes a fresh code and returns it without printing. `request()` keeps printing and is built on the same code path. The engine still holds one live code at a time, so issuing a link replaces a code a human was about to type; the dialog's "new code" covers that.
  - `auth.issueCode` is not in `AUTH_PROCEDURE_PATHS` / `OPEN_PATHS`, so the engine gate already refuses it without a trusted token (`engine-login.ts:370-389`) and an untrusted socket cannot call it (`:274-278`).
  - It is further limited to the engine token: the handler refuses unless the request's bearer token is the engine token. A logged-in browser must not be able to invite other browsers. `ConnectionTrust` (`:187-200`) is where that check belongs.
  - The code is never printed or logged by core on this path.
- **CLI** (`packages/cli/src/auth.ts`): `conciv auth link <url>` beside `revoke`, built with the same `@bomb.sh/router` pieces (`command`, `argument` with a zod URL schema, `envelopeFlag`, `handler`).
  - It uses the engine of the current directory only (`discoveredEngine(cwd)`, as `runRevoke` does), never the home db fallback, and sends no session and no `conciv-origin` header. A link for some other project's dev server would be a surprise.
  - Output is the CLI's normal JSON envelope: `{"ok":true,"data":{"link":"...","expiresAt":...}}`. No raw-text mode; a script reads `.data.link`.
  - The link is the given URL with `conciv_otp=<code>` merged into its fragment, keeping any fragment already there.
  - No dev server running is the usual "No conciv dev server" user failure.
- **Docs:** `packages/cli/src/README.md`, `packages/core/src/README.md`, and the site docs page that covers `conciv auth`, if there is one. One changeset.

### Test

One journey in the existing CLI test file, extending the engine test that already logs in and revokes (`packages/cli/test/cli.test.ts:1004`): get a link from `conciv auth link`, exchange its code, the token works, the engine printed nothing, a browser token is refused when it tries to issue a code, revoke locks the browser out. No new test file.

### Usage

```sh
playwright-cli open "$(conciv auth link http://localhost:3001/ | jq -r .data.link)"
```

## Part 2: no Approve prompt for outside agents (approved)

Approved by Omri on 2026-11-11.

### Rule

A tool with `approval: 'ask'` runs without a prompt when the caller is an outside agent. The agent inside the widget's own chat keeps its Approve cards: the user is sitting in front of that chat.

A caller is an outside agent when either holds:

- it labels itself `conciv-origin: hub` AND named the tab it acts on (`conciv tools --tab <id>`, or a `conciv mcp serve` call with a `tab`), or
- it reaches `/api/mcp` through the Claude plugin bridge: a Claude session header and no conciv session header.

The in-widget agent is neither: it always sends a conciv session header (`packages/harness/src/claude/args.ts:8`) and never the hub label. The plugin bridge is not hub-labelled on main (`packages/harness-init/src/claude/bridge.ts:126` sends only the Claude session id), which is why the second clause exists.

### The two places that ask

1. **RPC**, used by `conciv tools ...`: `refuseUnapproved` (`packages/core/src/api/rpc/router.ts:65-72`), three call sites (`:148,209,215`). Skip when the caller is hub-labelled and named its tab.
2. **MCP**, used by the plugin's Claude and by a hub call that names a tab: the code runner wraps every asking tool in `admitCall` (`packages/chat/src/index.ts:269-285`). `/api/mcp` already knows who is calling (`packages/core/src/api/mcp.ts:353-357`) and decides there.

A hub caller that did NOT name a tab keeps today's behaviour on both paths:

- Over MCP its asking tools are already removed (`packages/core/src/api/outside-run.ts:9`).
- Over RPC it is the CLI run from a folder with no `.conciv/server.json` above it: `engineOrigin` falls back to the home db (`packages/cli/src/engine-origin.ts:46-48`) and `withSession` sends the hub label with a session from `sessions.resolve({})`, which is the user's latest session row. That call still gets an Approve card. Skipping it there would let an agent in any folder run `page_eval` or `server restart` in the user's most recent tab with no prompt (review finding on #839).

Core cannot tell the two RPC cases apart from the session header, since the CLI sends one either way. The CLI therefore says so: it adds `conciv-named-tab: 1` next to the hub label only when `--tab` was given, `callTrace` reads it into the hub origin, and `refuseUnapproved` skips only for a hub caller that carries it. Like the hub label it is self-declared; it is a guardrail for our own tooling, not a boundary.

### Why

- It is not a security boundary (see "What the engine token already is").
- For an outside Claude or Codex it is a second prompt. The agent's own permission mode already decides whether the tool call may run, which is the rule `AGENTS.md` states for CLI commands.
- The calls still show in the chat as outside calls (`hubTraced`, `router.ts:74-96`; the MCP mirror in `mcp.ts`).

### What stays

- Allow (`hubAccess: 'session'` / `'project'`) is untouched: someone who wants a human in the loop gets one Allow, then no further prompts.
- A disconnected agent stays refused.
- Outside agents still cannot answer prompts (`mount.ts:99-104`).
- The in-widget agent's Approve cards, in a turn and through its CLI.

### Test

One journey per path in the existing files, replacing the tests that assert an outside caller is asked: a hub-labelled RPC call to an asking tool runs with no pending approval; the same call with no hub label still asks. Same pair on `/api/mcp` for a plugin-bridge caller against an in-widget caller. Tests that only existed to cover the removed prompt are deleted, not kept green by other means.

### Note for the `design-catalog` branch

That branch rewrites `mcp.ts`, `app.ts` and `router.ts`. It will need a merge to pick this up, on the same lines.

## Part 3: our own tests log in with the link (approved)

Today the shared helpers get logged in by reading the dev server's output for the printed code (`packages/harness-testkit/src/login.ts`, `e2e/e2e-utils/src/widget.ts`; 27 files reach them). They switch to `auth.issueCode` with the engine token.

- Helpers whose only job is "get this browser logged in" switch (`loginThroughTerminal`, `magicLink`, `loginWidget`, `trustedEngineBase` and their callers).
- Tests whose subject is the printed code or the Authorize dialog keep reading the terminal (`openLoginFromLockedLauncher`, the core login tests). That is the product path a human uses and must stay covered.
- A helper left with no callers is deleted.

## Finding to weigh separately

Gates 5 and 6 can be skipped today by any process that holds the engine token, by leaving out `conciv-origin` or by sending a loopback `Origin` header, and the same process can answer prompts through `chat.permissionDecision`. Nothing here changes that. It is written down because it is the reason Part 2 costs no real protection.
