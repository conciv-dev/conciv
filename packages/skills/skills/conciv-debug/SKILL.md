---
name: conciv-debug
description: Use when a conciv integration misbehaves at runtime — the conciv button/widget never appears, the widget loads but never connects to the engine, a tool call is refused pending approval or a command waits on an approval card, an approval/permission card never resolves or the agent gets silently denied, the engine reports a port already in use or the widget points at the wrong port, or an automated (Playwright/e2e) test against the live widget hangs. Covers the sandbox/approval/SSE runtime, not initial install (see conciv-setup) or extension authoring (see conciv-develop).
metadata:
  package: '@conciv/skills'
---

# Debugging a conciv integration

## Who this is for

You are looking at a conciv widget that is installed (see the conciv-setup skill if it is not) but
misbehaving at runtime: it does not show up, it shows up but cannot reach the engine, a tool call
never finishes, or an approval prompt never resolves. This skill is about the sandbox/approval/SSE
runtime underneath the widget, not the install step or extension authoring — see conciv-setup and
conciv-develop for those.

This skill was written straight from the current runtime source, and every claim below cites the file
it came from.

## Failure scenario 1: the conciv button never appears

The widget script probes the engine on load and only renders once that probe succeeds. Symptom →
cause → fix:

| Symptom                                                              | Cause                                                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No button in a Vite production build                                 | The Vite plugin only runs during `vite dev` — `apply: 'serve'` (`packages/plugin/src/core/vite.ts:178`) — so neither the engine boot nor the `<script>` injection ever happens at `vite build` time                                                                                                                                                                                                           | expected, not a bug: conciv is dev-only for Vite by construction and never ships to a Vite production build, `enabled` or not                                                                                                                                                                                                                                                                                                                                                                                      |
| Widget silently present in a webpack/Rspack/Next.js production build | Those plugins boot the engine whenever `enabled !== false`, with no build-mode check of their own (`packages/plugin/src/index.ts:19-24`)                                                                                                                                                                                                                                                                      | gate it explicitly: `conciv({enabled: process.env.NODE_ENV !== 'production'})` — `resolveConfig` defaults `enabled` to `true` (`packages/core/src/config.ts:50-53`), so an unguarded call really does ship                                                                                                                                                                                                                                                                                                         |
| No button, webpack/Rspack                                            | Plugin boots the engine but never injects a `<script>` tag                                                                                                                                                                                                                                                                                                                                                    | set `widgetUrl` and serve the bundle yourself — see conciv-setup's webpack/Rspack section                                                                                                                                                                                                                                                                                                                                                                                                                          |
| No button, custom host (no bundler plugin)                           | `createConciv(...).mount(el)` never called, or called on an element removed before `impl.ready` resolves                                                                                                                                                                                                                                                                                                      | call `mount` on an element that stays in the DOM; `mount()` is a no-op if `state !== 'unmounted'` so a second call while `'mounting'` is silently dropped (`packages/embed/src/mount.ts:49-52`)                                                                                                                                                                                                                                                                                                                    |
| Button appears, panel never opens                                    | `open()`/`close()`/`toggle()` do not touch the panel; they emit a named panel command onto the shared event bus (`emitPanelCommand`, `packages/embed/src/mount.ts:87-107`) and the widget root is the only subscriber — it starts the bus and binds `open`/`close`/`toggle` on mount (`apps/conciv/src/routes/__root.tsx:291-311`) — so until it mounts there is no `panel` peer to acknowledge the handshake | a command emitted before the bus answers is QUEUED and flushed on connect (`packages/protocol/src/event-bus.ts:198-212`), with the embed client retrying the handshake every 500ms up to 60 times (`packages/embed/src/mount.ts:37-47`); only after those retries does the client go `failed` and drop what it queued (`packages/protocol/src/event-bus.ts:177-188`). A dead button therefore means the widget never mounted inside that ~30s window, not a lost event — and a later click opens a fresh handshake |

## Failure scenario 2: widget renders but never connects to the engine

This is different from "no button": the widget script loaded, but its `apiBase` cannot reach a
running engine, or the engine rejects the origin.

- **Port mismatch.** The engine's actual bound port can differ from the one you configured. Pin it
  with `conciv({port: 7378})`. On the Vite integration a taken port is just a preference — the
  engine falls back to an OS-assigned port and logs `port ${preferred} is already in use, the engine
  is listening on http://127.0.0.1:${serving.port} instead` (`packages/core/src/start.ts:84-92`), and
  the page picks up the port it actually bound. On Next.js and the generic webpack/Rspack plugin
  there is no such fallback path for the client: the client learns the port before the engine boots
  (Next inlines it into `next.config`'s env; webpack/Rspack never inject the widget at all, so you
  set `widgetUrl` by hand), so a taken port there fails the boot instead of silently reconnecting —
  fix the conflict (kill whatever else holds the port, or pin a different one) rather than expecting
  a fallback.
- **CORS / wrong origin.** The engine only allows loopback origins (`localhost`, `127.0.0.1`, `[::1]`)
  plus anything in `allowedOrigins` by default (`packages/core/src/lib/cors.ts` —
  `originAllowed`/`LOOPBACK_HOSTNAMES`). A widget served from a non-loopback host (a tunnel, a LAN IP,
  a container hostname) needs that host added to `allowedOrigins` in the `StartOpts` that boot the
  engine, or requests fail CORS silently in the browser console before the widget ever renders a chat.
- **Manual mount pointed at the wrong `apiBase`.** `createConciv({apiBase})` and `rebind(apiBase)`
  both no-op past the initial connect if called out of order — `rebind` only runs `rebindImpl` while
  `state === 'mounted'` (`packages/embed/src/mount.ts:109-112`); calling it before `mount()` resolves,
  or after `unmount()`, is a silent no-op, not a queued reconnect.

## Failure scenario 3: a tool call is refused, or waits on a card

Nothing in the engine blocks a turn on an approval. There is no ask timeout and no wait on an open
widget: approvals are a stored request plus a stored grant, and tools and sandbox commands reach them
by two different paths.

- **Tools declared `approval: 'ask'`** go through `gatedTools`
  (`packages/ai/src/server/chat-server.ts:162-176`), whether the agent calls them directly or from
  code mode (`chatToolSet` splits them out, `packages/chat/src/code-mode.ts:147-149`). Without a grant
  the wrapper emits an `approval-requested` custom event and throws at once:
  `Tool "<name>" needs the user's approval. The request is shown to the user; retry once they approve
  it.` (`approvalNeeded`, `packages/ai/src/server/chat-server.ts:156-160`). A tool result carrying that
  text is the design working, not a hang: the model got its answer immediately and the card is waiting
  on the user, whether or not a widget is open. A call from outside a chat turn (external MCP, the
  `conciv` CLI, raw RPC) gets the same refusal from `admitCall` (`packages/chat/src/index.ts`): approving
  it stores a one-time grant only that caller's retry consumes, posts no message and starts no turn.
- **Shell commands** run through the sandbox, whose policy is `default: 'ask'`
  (`packages/ai/src/server/chat-server.ts:234-247`). The rules come from
  `packages/core/src/command-policy.ts`, passed in at `packages/core/src/app.ts:479` together with the
  CLI aliases of every tool that needs no approval. Precedence is deny, then ask, then allow.
- **A command that should auto-allow is stuck on a card.** `readOnlyCommandAsks`
  (`packages/core/src/command-policy.ts:64-68`) beats the allow list, so a read-only head still asks
  when the line contains a shell metacharacter (`;`, `&`, `|`, a backtick, `$`, `>`, `<`) or a write or
  execute flag on an allowlisted head: `git branch -D`, `git log --output`, `find -delete`/`-exec`,
  `grep --pager`, `rg --pre`, `date -s`. So `ls foo | grep bar` asks, because the pipe alone matches
  `*|*`. Check the command against those patterns before concluding the allow list is wrong.
- **The same command asked twice.** A grant is remembered for the session only when the user answers
  with `scope: 'session'` (`packages/chat/src/approvals.ts:83-100`). A `once` grant is consumed by the
  next run (`forRun`, `packages/chat/src/approvals.ts:101-105`), and a command containing a shell
  metacharacter is never session-grantable: it falls back to `once`
  (`sessionGrantable`, `packages/chat/src/approvals.ts:48-55`). Asking again is the design, not a lost
  decision.
- **First-response hang with no tool call involved.** `guardedAdapter`
  (`packages/ai/src/server/run-guard.ts:44-49`) bounds the wait for the harness's first output,
  `FIRST_OUTPUT_TIMEOUT_MS` by default (`packages/chat/src/index.ts:30`), and fails the run with
  `the agent produced no output within Ns` (`packages/ai/src/server/chat-server.ts:381-386`). That is
  a harness/CLI problem (wrong binary, CLI stuck on its own prompt), not an approval; see the
  conciv-harness skill if you're debugging a specific adapter.

## Failure scenario 4: an approval never resolves

- **The request is already gone when the click lands.** `decide` settles only an id still in the
  thread's pending list and returns `false` otherwise
  (`packages/chat/src/approvals.ts:83-85`). The RPC turns that `false` into `UNKNOWN_REQUEST`
  (`packages/core/src/api/rpc/chat.ts:10-15`), so a second click on an answered card surfaces as
  "no pending approval", not silence.
- **A card outlives its run on purpose.** Pending requests live in thread metadata, not in the run
  (`asked`, `packages/chat/src/approvals.ts:70-74`), and `chat.hydrate` returns them after a reload
  (`packages/chat/src/index.ts:101`). A card that survives a reload or a finished run is still
  answerable.
- **Approving records a grant; it does not run the tool.** `decide` only writes the grant
  (`packages/chat/src/approvals.ts:92-98`). The server reads grants when a run starts, through
  `forRun` in the turn's setup (`packages/chat/src/turn.ts:201-206`), so the tool executes when a run
  retries it, not at the click.
- **Deny writes nothing.** A denied request leaves the pending list and adds no grant
  (`packages/chat/src/approvals.ts:91`), so a later retry asks again.

## Failure scenario 5: SSE stream never settles, tests hang

The chat runtime deliberately has no single "settled" moment, and it is split across three surfaces
rather than one subscribe call:

- **The one-shot snapshot is `chat.hydrate`** (`packages/contract/src/contract.ts:136`), served by
  the plane's `hydrate` (`packages/chat/src/index.ts:94-104`). It resolves once with messages, the
  active run, the last run lifecycle, and any pending approvals; it never streams.
- **The turn itself streams over the delivery routes**, WebSocket at `CHAT_WS_PATH` and Server-Sent
  Events at `CHAT_SSE_PATH` (`packages/chat/src/index.ts:107-123`). A POST starts the turn and streams
  it; a GET with a resume offset REPLAYS a run from its durable log instead of starting one
  (`resume`, `packages/ai/src/server/delivery.ts:138-143`), which is how a reload rejoins a run
  already in flight.
- **Out-of-band session events** ride the `chat.events` iterator, which is the session bus's `events`
  generator and lives until its `AbortSignal` fires
  (`packages/core/src/sessions/session-bus.ts:24-46`).

Two consequences:

- **Playwright's `page.waitForLoadState('networkidle')` never resolves** against a page with the live
  widget open, because the open turn socket plus the events iterator keep the network non-idle
  forever. Wait for `'domcontentloaded'`, or for a concrete UI signal (an element appearing/its text
  changing), never `networkidle`. This mirrors the repo's own testing rule for widget ITs
  (`AGENTS.md` — "Never wait for Playwright `networkidle`... its SSE stream keeps the network busy
  forever").
- **A held-open browser context/page from a previous test run** keeps its subscription alive
  server-side: a bus listener is released only on abort or in the generator's `finally`
  (`packages/core/src/sessions/session-bus.ts:24-46`). Always `unmount()`/close the page, don't just
  navigate away.

## Red flags — stop and check the mechanism, not the symptom

- Increasing a client-side polling/retry loop instead of checking whether the widget ever reached
  `'mounted'` state (`packages/embed/src/mount.ts`) — a widget stuck in `'mounting'` will retry
  forever against nothing.
- Assuming any approval failure is a "denied by user" — the `needs the user's approval` tool result
  (`packages/ai/src/server/chat-server.ts:156-160`) means nobody has answered yet, and a
  settled-then-clicked card reports `UNKNOWN_REQUEST`.
- Reaching for `networkidle` in a new Playwright check against the live widget — it will hang, not
  flake occasionally.
- Adding a command to `READ_ONLY_COMMANDS` to silence an approval prompt without first checking it
  against `readOnlyCommandAsks` — a shell metacharacter or a write flag on an allowlisted head forces
  the ask no matter what the allow list says, so the fix is almost never "the command needs to be
  allowlisted."
- Treating a multi-second hang as an approval wait — approvals never block a turn, so a hang points
  at the harness CLI.
- Treating a stream that never goes idle as a bug — every long-lived surface here (the turn socket,
  the events iterator) is open by design; assert on a UI signal instead of on quiet.
- Debugging extension-authoring behavior (tool contracts, `Component`/`Surface` wiring) instead of
  runtime plumbing — that's the conciv-develop skill's territory; this skill covers the
  sandbox/approval/SSE runtime underneath, not how an extension is built.

## Sources

- `packages/ai/src/server/chat-server.ts`
- `packages/ai/src/server/run-guard.ts`
- `packages/chat/src/approvals.ts`
- `packages/chat/src/code-mode.ts`
- `packages/chat/src/index.ts`
- `packages/chat/src/turn.ts`
- `packages/core/src/command-policy.ts`
- `packages/core/src/sessions/session-bus.ts`
- `packages/core/src/api/rpc/chat.ts`
- `packages/contract/src/contract.ts`
- `packages/protocol/src/event-bus.ts`
- `packages/core/src/start.ts`
- `packages/core/src/lib/cors.ts`
- `packages/core/src/app.ts`
- `packages/embed/src/mount.ts`
- `apps/conciv/src/routes/__root.tsx`
- `packages/core/src/config.ts`
- `packages/plugin/src/core/vite.ts`
- `packages/plugin/src/index.ts`
- `apps/site/content/docs/troubleshooting.mdx`
- `apps/site/content/docs/usage/approvals.mdx`
- `AGENTS.md`
