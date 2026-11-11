# Consent token: unattended outside-agent runs

Status: proposal, waiting for Omri's decision. Nothing is implemented.
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

## Proposal

One rule: a caller that presents the consent token is admitted at gates 5 and 6 without a prompt. Every other gate stays as it is.

### Option 1 (recommended): a shared secret in the environment

- **Who mints it.** The person or script starting the run: `export CONCIV_CONSENT_TOKEN="$(uuidgen)"`. Core never generates, stores or prints it.
- **Where it lives.** Only in the environment of the dev server process and of the callers. No file, nothing in `.conciv/`, nothing in the Vite config, so it cannot be committed. It is read in `resolveConfig` next to the other `CONCIV_*` variables (`config.ts:57-71`) and deliberately has no `ConcivConfig` option.
- **How a caller presents it.** A new header `conciv-consent: <token>`.
  - CLI: `packages/cli/src/request.ts:70` and `packages/cli/src/hub.ts:75` add it when `CONCIV_CONSENT_TOKEN` is set in their environment.
  - Claude plugin bridge: `packages/harness-init/src/claude/bridge.ts:122-128` adds it the same way. If `claude -p` hands its environment to plugin MCP servers (to confirm when implementing), `CONCIV_CONSENT_TOKEN=... claude -p ...` is the whole user-facing step.
- **What core does.** `callTrace` (`call-trace.ts:22-40`) already parses the caller's hub headers in one place. It gains one boolean, `unattended`, true when the engine was started with a token and the header matches it under the existing constant-time compare (`sameCode`, `engine-login.ts:57-61`). `admitOutside` (`app.ts:605`), `refuseUnapproved` (`router.ts:65`) and the MCP `admit` (`mcp.ts:294`) return "allowed" when it is true. Three call sites, no new store, no new RPC procedure.
- **Scope.** One engine process. Every session on that engine, every tool.
- **Expiry.** The engine process. Stop the dev server and the token is dead.
- **What it does not change.** Gate 2 (the caller still needs the engine token), gate 4 (a disconnected agent stays refused; disconnect is the user's explicit "no") and gate 7 (outside agents still cannot answer prompts).
- **What the user sees.** One line at engine start saying unattended consent is on, never the value. Calls still mirror into the chat as outside calls (`hubTraced`, `router.ts:74-96`), and carry an "unattended" mark so the transcript shows nobody approved them.
- **Hardening.** Refuse to start when the variable is set but shorter than 32 characters. Ignore the header on requests that carry an `Origin` (a browser must never be the one presenting it). Never echo the header in logs or error messages.
- **Size.** About 40 lines of product code across core, CLI and bridge, plus one journey test in the existing CLI test file: engine with `hubAccess: 'session'` and a token; a hub-labelled call to a tool that asks succeeds with the header and is refused without it.

### Option 2: minted, stored tokens

- `conciv consent create [--ttl 1h] [--label ci]` writes a hash row to `.conciv/consent-tokens.json` (same shape and `0600` write path as `trusted-browsers.json`, `engine-trust.ts:53-75`) and prints the token once to stdout. `conciv consent list` / `revoke`. Core watches the file as it does trusted browsers (`engine-login.ts:161-185`) so a revoke takes effect on a running engine.
- Presentation and the three gate call sites are the same as option 1.
- Gains: attach to a dev server that is already running, no restart; per-token label, expiry and revoke; several tokens at once.
- Costs: a new state file, three CLI subcommands, expiry and revoke logic, a token printed to a terminal (scrollback, CI logs), and a long-lived secret on disk next to the engine token.

### Comparison

|                                        | Option 1: env secret          | Option 2: stored tokens           |
| -------------------------------------- | ----------------------------- | --------------------------------- |
| New surface                            | 1 env var, 1 header           | 1 header, 1 file, 3 CLI commands  |
| Works on an already running dev server | No, restart with the variable | Yes                               |
| Expiry                                 | Engine process                | Per token TTL                     |
| Revoke                                 | Stop the engine               | `conciv consent revoke`           |
| Token ever printed or written to disk  | No                            | Yes, once to stdout; hash on disk |
| Product code                           | ~40 lines                     | ~200 lines                        |

Recommendation: option 1. Headless runs and tests start their own dev server, so "restart with the variable" costs nothing there, and it is the only option where the secret is never printed or stored. Option 2's header and gate changes are identical, so it can be added later without reshaping anything if attaching to a running server turns out to matter.

### Browser authorization (gate 3)

The consent token should not cover this. Browser trust is a transport credential, and the engine token already is one. Two ways work today with no product change:

1. Seed the tab before the widget boots: set `localStorage['conciv:engine-token:<apiBase>']` to the engine token from `.conciv/server.json` (Playwright `addInitScript` or `storageState`). The widget presents it through `auth.trust` and never asks for a code. This is read from source (`browser-transport.ts:350-356`, `engine-login.ts:194,312-316`) and has not been run.
2. Open the page on the printed `#conciv_otp=<code>` link, as the e2e helpers do.

The first relies on an internal storage key and the second on scraping the terminal. If Omri wants a supported path, the smallest one is a URL fragment `#conciv_token=<engine token>` handled beside the existing `conciv_otp` fragment (`browser-transport.ts:40,123-139`): read it, call `requestTrustWithToken`, strip it from the URL. That is new public surface, so it is a separate yes/no.

## Decisions for Omri

1. Option 1 or option 2.
2. Does the token cover Approve (gate 6) as well as Allow (gate 5)? The proposal says both; a run that still stops on `page_eval` is not unattended.
3. Scope: every session on the engine (proposed), or one named session.
4. Browser authorization: leave as the localStorage recipe, or add the `#conciv_token=` fragment.
5. Whether the `design-catalog` branch should take main's `hubAccess` default of `'open'`. That alone removes the Allow prompt there; Approve still needs the token.

## Finding to weigh separately

Gates 5 and 6 can be skipped today by any process that holds the engine token, by leaving out `conciv-origin` or by sending a loopback `Origin` header, and the same process can answer prompts through `chat.permissionDecision`. This spec does not change that and does not depend on it. It is written down here because it defines what the consent token is: a visible switch for cooperative tooling, not a new privilege.
