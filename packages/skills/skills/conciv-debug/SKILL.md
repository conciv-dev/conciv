---
name: conciv-debug
description: Use when a conciv integration misbehaves at runtime — the conciv button/widget never appears, the widget loads but never connects to the engine, a tool call hangs or "hangs then fails after ~2 minutes", an approval/permission card never resolves or the agent gets silently denied, the engine reports a port already in use or the widget points at the wrong port, or an automated (Playwright/e2e) test against the live widget hangs. Covers the sandbox/gate/SSE runtime, not initial install (see conciv-setup) or extension authoring (see conciv-develop).
metadata:
  package: '@conciv/skills'
---

# Debugging a conciv integration

## Who this is for

You are looking at a conciv widget that is installed (see the conciv-setup skill if it is not) but
misbehaving at runtime: it does not show up, it shows up but cannot reach the engine, a tool call
never finishes, or an approval prompt never resolves. This skill is about the sandbox/gate/SSE
runtime underneath the widget, not the install step or extension authoring — see conciv-setup and
conciv-develop for those.

This skill was written straight from the current runtime source, and every claim below cites the file
it came from.

## Failure scenario 1: the conciv button never appears

The widget script probes the engine on load and only renders once that probe succeeds. Symptom →
cause → fix:

| Symptom                                                              | Cause                                                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No button in a Vite production build                                 | The Vite plugin only runs during `vite dev` — `apply: 'serve'` (`packages/plugin/src/core/vite.ts:165`) — so neither the engine boot nor the `<script>` injection ever happens at `vite build` time                                                                                                                                                                                                           | expected, not a bug: conciv is dev-only for Vite by construction and never ships to a Vite production build, `enabled` or not                                                                                                                                                                                                                                                                                                                                                                                      |
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

## Failure scenario 3: a tool call hangs, then fails

Two different code paths gate tool calls, and they fail differently — knowing which one you're in
tells you whether "hangs" means seconds or two minutes:

- **Normal chat tools** go through `makeRunGate` (`packages/core/src/chat/gate.ts:209-224`), which
  does **not** check whether anything is watching the session's stream. It opens the ask, emits
  an approval-requested chunk into the run log (so it survives a reload), and waits up to
  `ASK_TIMEOUT_MS` — **120 seconds** (`packages/core/src/chat/ask-constants.ts:1`) — before treating
  it as a timeout and refusing the tool with `Tool "<name>" received no approval decision (the ask
timed out)` (`approvalRefusal`, `packages/core/src/chat/gate.ts:100-104`). If the widget tab was
  closed when the tool call fired, this is exactly what you'll see: a two-minute hang, then a
  refusal — not an infinite hang, but not fast either.
- **Code-mode tools** (the QuickJS-isolate sandboxed path, `packages/core/src/chat/code-mode.ts`)
  check `listening(sessionId)` **first**, before ever opening an ask. If nothing is attached to that
  session it fails immediately with `Tool "<name>" requires approval but nothing is attached to
session "<id>" to answer; open the widget on that session and retry`
  (`noListenerRefusal`, `packages/core/src/chat/gate.ts:106-108`, thrown by `gatedToolRun` in
  `packages/core/src/chat/code-mode.ts:125-141`). "Attached" means the session has at least one
  watcher registered on the in-process stream registry: `listening` is wired to
  `deps.stream.watched` (`packages/core/src/chat/run.ts:142-148`), and a watcher is held both by an
  open turn transport and by every `stream.listen` subscriber. If a code-mode tool call fails
  instantly with that exact message, the fix is "open the widget on that session," not a timeout or
  retry.
- **A command that should auto-allow is stuck on an approval card instead.** For `Bash`, approval is
  decided by `needsApproval` (`packages/core/src/chat/gate.ts:86-96`): a tool is risky if its name is
  in the `risky` set, or if `classifyCommand` doesn't classify the command as `'allow'` and the
  session hasn't already remembered it. `classifyCommand`
  (`packages/core/src/chat/gate.ts:64-72`) first splits the command into pipeline segments and then
  requires **every** segment to be allowlisted (`READ_ONLY_COMMANDS`/`GIT_READ_ONLY_SUBCOMMANDS`,
  `packages/core/src/chat/gate.ts:28-46`, plus whatever the harness adds via `commandAllows`) and to
  not escape read-only intent. So `ls foo | grep bar` **does** auto-allow: the pipe is a separator,
  not a disqualifier.
- **What actually forces an ask on a read-only-looking command** is one of two grammar rules, not the
  allowlist. `commandSegments` (`packages/core/src/chat/command-grammar.ts:85-94`) returns `null` —
  which `classifyCommand` treats as `'ask'` — for anything containing a character outside its plain
  set: quotes, parentheses, `$`, backticks, `>`/`<` redirects, newlines (a trailing `2>/dev/null` is
  the one tolerated redirect). And `escapesReadOnlyIntent`
  (`packages/core/src/chat/command-grammar.ts:66-83`) re-asks for an allowlisted head used to write
  or execute: `git branch -D`, `git --output`, `find -delete`/`-exec`, `grep --pager`, `rg --pre`,
  `env FOO=1 cmd`, `date -s`. Check the command against those two rules before concluding the
  allowlist is wrong.
- **The same command asked twice.** An approval is only remembered when the user answers with
  `scope: 'session'`; that path calls `commandMemory.remember`
  (`packages/core/src/api/rpc/chat.ts:13`), which promotes the normalized command string into the
  session's allowed set (`packages/core/src/chat/command-memory.ts:33-43`). A one-off approval is
  noted and then discarded when the ask settles, so the next identical command asks again — that is
  the design, not a lost decision.
- **First-response hang with no tool call involved.** `run.ts` bounds how long it waits for the
  harness CLI's _first_ output chunk (`FIRST_CHUNK_TIMEOUT_MS`, wired via `boundFirstChunk` in
  `packages/core/src/chat/run.ts:501-505`) and aborts with `"<harness> produced no output within Ns"`
  if the CLI process itself is wedged — that's a harness/CLI problem (wrong binary, CLI stuck on its
  own prompt), not the approval gate; see the conciv-harness skill if you're debugging a specific
  adapter.

## Failure scenario 4: an approval never resolves at all (not even a timeout)

- **The ask is already gone when the click lands.** `AskRegistry.reply` settles an ask only while it
  is still open under that `sessionId`/`key` pair (`packages/core/src/chat/ask.ts:81-87`); a reply
  arriving after the 120s timeout fired, or after the run ended, is dropped and `reply` returns
  `false`. The RPC turns that `false` into an `UNKNOWN_REQUEST` error
  (`packages/core/src/api/rpc/chat.ts:10-18`), so an Approve/Deny click on a stale card surfaces as
  "no pending approval", not silence. The session is resolved from the approval id itself via
  `asks.owner`, so a session-id mismatch on the client is not the explanation — a settled or
  cancelled ask is.
- **The run ended while the card was still up.** Finishing a run calls `deps.asks.cancel(sessionId)`
  (`packages/core/src/chat/run.ts:408-421`), which settles every open ask for that session with
  `null` and forgets the session's ask state (`packages/core/src/chat/ask.ts:106-113`). A card left
  on screen after its run settled is therefore already answered as a non-decision server-side;
  clicking it can only produce `UNKNOWN_REQUEST`.
- **Timeout is a `null` decision, not a crash.** `waitFor` arms a timer that settles the ask with
  `null` (`packages/core/src/chat/ask.ts:88-105`), which `approvalRefusal` maps to the `'timeout'`
  branch, not `'deny'` — the wording differs (`"received no approval decision (the ask timed out)"`
  vs `"was denied by the user"`), which is useful when reading logs to tell an actual user click from
  a stale timeout.

## Failure scenario 5: SSE stream never settles, tests hang

The chat runtime deliberately has no single "settled" moment, and it is split across three surfaces
rather than one subscribe call:

- **The one-shot snapshot is `chat.hydrate`** (`packages/contract/src/contract.ts:135-137`), served by
  `hydrateSession` (`packages/core/src/chat/hydrate.ts:6-19`). It resolves once with messages, the
  active run, the last run lifecycle, and any pending approvals — it never streams.
- **The turn itself streams over the delivery routes**, WebSocket at `CHAT_WS_PATH` and Server-Sent
  Events at `CHAT_SSE_PATH` (`packages/core/src/chat/delivery.ts:126-169`). A POST starts the turn
  and streams it; a GET with a `last-event-id`/`offset` REPLAYS a run from the durable log instead of
  starting one (`resumeOffsetOf`, `packages/core/src/chat/delivery.ts:64-69`), which is how a reload
  rejoins a run already in flight.
- **Out-of-band session events** (approval cards, run lifecycle) ride the `chat.events` iterator,
  which is `sessionEvents` over the in-process registry and lives until its `AbortSignal` fires
  (`packages/core/src/chat/session-events.ts:46-56`).

Two consequences:

- **Playwright's `page.waitForLoadState('networkidle')` never resolves** against a page with the live
  widget open, because the open turn socket plus the events iterator keep the network non-idle
  forever. Wait for `'domcontentloaded'`, or for a concrete UI signal (an element appearing/its text
  changing), never `networkidle`. This mirrors the repo's own testing rule for widget ITs
  (`AGENTS.md` — "Never wait for Playwright `networkidle`... its SSE stream keeps the network busy
  forever").
- **A held-open browser context/page from a previous test run** keeps its subscription alive
  server-side. `stream.listen` registers a listener AND a watcher, and both are released only by the
  returned unsubscribe (`packages/core/src/chat/session-events.ts:32-42`), which for the events
  iterator runs on abort or in the generator's `finally`. A test harness that doesn't tear pages down
  can therefore leak watchers and make `stream.watched(sessionId)` report true for a session nothing
  is really looking at — which then changes which gate path (scenario 3) a later approval takes.
  Always `unmount()`/close the page, don't just navigate away.

## Red flags — stop and check the mechanism, not the symptom

- Increasing a client-side polling/retry loop instead of checking whether the widget ever reached
  `'mounted'` state (`packages/embed/src/mount.ts`) — a widget stuck in `'mounting'` will retry
  forever against nothing.
- Assuming any approval failure is a "denied by user" — read whether the message says `denied` or
  `timed out` (`packages/core/src/chat/gate.ts:100-104`); they mean different things operationally,
  and a settled-then-clicked card reports `UNKNOWN_REQUEST` rather than either.
- Reaching for `networkidle` in a new Playwright check against the live widget — it will hang, not
  flake occasionally.
- Adding a command to `READ_ONLY_COMMANDS` to silence an approval prompt without first running it
  past the command grammar — a quoted argument, a redirect, or a write flag on an allowlisted head
  forces the ask no matter what the allowlist says, so the fix is almost never "the command needs to
  be allowlisted."
- Debugging a stuck code-mode tool call as if it were the 120s ask-timeout path — it fails in
  milliseconds via `noListenerRefusal`, so a multi-second hang there points elsewhere (the harness
  CLI, not the gate).
- Treating a stream that never goes idle as a bug — every long-lived surface here (the turn socket,
  the events iterator) is open by design; assert on a UI signal instead of on quiet.
- Debugging extension-authoring behavior (tool contracts, `Component`/`Surface` wiring) instead of
  runtime plumbing — that's the conciv-develop skill's territory; this skill covers the
  sandbox/gate/SSE runtime underneath, not how an extension is built.

## Sources

- `packages/core/src/chat/gate.ts`
- `packages/core/src/chat/command-grammar.ts`
- `packages/core/src/chat/command-memory.ts`
- `packages/core/src/chat/ask.ts`
- `packages/core/src/chat/ask-constants.ts`
- `packages/core/src/chat/run.ts`
- `packages/core/src/chat/code-mode.ts`
- `packages/core/src/chat/delivery.ts`
- `packages/core/src/chat/hydrate.ts`
- `packages/core/src/chat/session-events.ts`
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
