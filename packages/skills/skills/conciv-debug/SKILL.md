---
name: conciv-debug
description: Use when a conciv integration misbehaves at runtime — the conciv button/widget never appears, the widget loads but never connects to the engine, a tool call hangs or "hangs then fails after ~2 minutes", an approval/permission card never resolves or the agent gets silently denied, the engine reports a port already in use or the widget points at the wrong port, or an automated (Playwright/e2e) test against the live widget hangs. Covers the sandbox/gate/SSE runtime, not initial install (see conciv-setup) or extension authoring (see conciv-develop).
metadata:
  package: '@conciv/skills'
  library_version: '0.0.19'
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

| Symptom                                                              | Cause                                                                                                                                                                                               | Fix                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No button in a Vite production build                                 | The Vite plugin only runs during `vite dev` — `apply: 'serve'` (`packages/plugin/src/core/vite.ts:165`) — so neither the engine boot nor the `<script>` injection ever happens at `vite build` time | expected, not a bug: conciv is dev-only for Vite by construction and never ships to a Vite production build, `enabled` or not                                                                                          |
| Widget silently present in a webpack/Rspack/Next.js production build | Those plugins boot the engine whenever `enabled !== false`, with no build-mode check of their own (`packages/plugin/src/index.ts:19-24`)                                                            | gate it explicitly: `conciv({enabled: process.env.NODE_ENV !== 'production'})` — `resolveConfig` defaults `enabled` to `true` (`packages/core/src/config.ts:27`), so an unguarded call really does ship                |
| No button, webpack/Rspack                                            | Plugin boots the engine but never injects a `<script>` tag                                                                                                                                          | set `widgetUrl` and serve the bundle yourself — see conciv-setup's webpack/Rspack section                                                                                                                              |
| No button, custom host (no bundler plugin)                           | `createConciv(...).mount(el)` never called, or called on an element removed before `impl.ready` resolves                                                                                            | call `mount` on an element that stays in the DOM; `mount()` is a no-op if `state !== 'unmounted'` so a second call while `'mounting'` is silently dropped (`packages/embed/src/mount.ts:38-40`)                        |
| Button appears, panel never opens                                    | Nothing wired to `open()`/`toggle()`; these just `dispatchEvent` a `CustomEvent` (`packages/embed/src/mount.ts:27-30`, `packages/embed/src/mount.ts:72-82`)                                         | wire something to call `open()`/`toggle()`, and confirm the mounted widget reached `state === 'mounted'` before dispatching — if the listener never attached (mount still `'mounting'`), the event is lost, not queued |

## Failure scenario 2: widget renders but never connects to the engine

This is different from "no button": the widget script loaded, but its `apiBase` cannot reach a
running engine, or the engine rejects the origin.

- **Port mismatch.** The engine's actual bound port can differ from the one you configured. Pin it
  with `conciv({port: 7378})`. On the Vite integration a taken port is just a preference — the
  engine falls back to an OS-assigned port and logs `port ${preferred} is already in use, the engine
is listening on http://127.0.0.1:${serving.port} instead` (`packages/core/src/start.ts:83-91`), and
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
  `state === 'mounted'` (`packages/embed/src/mount.ts:84-87`); calling it before `mount()` resolves,
  or after `unmount()`, is a silent no-op, not a queued reconnect.

## Failure scenario 3: a tool call hangs, then fails

Two different code paths gate tool calls, and they fail differently — knowing which one you're in
tells you whether "hangs" means seconds or two minutes:

- **Normal chat tools** go through `makeRunGate` (`packages/core/src/chat/gate.ts:115-123`), which
  does **not** check whether anything is listening on the session's stream. It opens the ask, emits
  an approval-requested chunk into the run log (so it survives a reload), and waits up to
  `ASK_TIMEOUT_MS` — **120 seconds** (`packages/core/src/chat/ask.ts:3`) — before treating it as a
  timeout and refusing the tool with `Tool "<name>" received no approval decision (the ask timed
out)` (`approvalRefusal`, `packages/core/src/chat/gate.ts:75-79`). If the widget tab was closed when
  the tool call fired, this is exactly what you'll see: a two-minute hang, then a refusal — not an
  infinite hang, but not fast either.
- **Code-mode tools** (the isolated-vm sandboxed path, `packages/core/src/chat/code-mode.ts`) check
  `listening(sessionId)` **first**, before ever opening an ask. If nothing is attached to that
  session it fails immediately with `Tool "<name>" requires approval but nothing is attached to
session "<id>" to answer; open the widget on that session and retry`
  (`noListenerRefusal`, `packages/core/src/chat/gate.ts:81-83`, wired in
  `packages/core/src/chat/code-mode.ts:76`). If a code-mode tool call fails instantly with that exact
  message, the fix is "open the widget on that session," not a timeout or retry.
- **A command that should auto-allow is stuck on an approval card instead.** Approval is decided by
  `requiresApproval`/`needsApproval` (`packages/core/src/chat/gate.ts:56-71`): a tool is risky if its
  name is in the `risky` set, or (for `Bash`) if `classifyCommand` doesn't classify it as `'allow'`.
  The allowlist is intentionally narrow — plain read-only commands (`ls`, `cat`, `grep`, `git status`,
  etc., `READ_ONLY_COMMANDS`/`GIT_READ_ONLY_SUBCOMMANDS`, `packages/core/src/chat/gate.ts:17-34`) plus
  anything the harness adds via `commandAllows`. Any shell metacharacter (`;`, `&`, `|`, backtick,
  `$`, `>`, `<`) forces `'ask'` even if the base command is allowlisted
  (`SHELL_METACHARACTER_PATTERNS`, `packages/core/src/chat/gate.ts:36-49`) — `ls foo | grep bar` asks
  even though both halves are individually allowed. If a command you expected to run silently is
  instead sitting on an approval card, check it for a metacharacter before assuming the allowlist is
  wrong.
- **First-response hang with no tool call involved.** `run.ts` bounds how long it waits for the
  harness CLI's _first_ output chunk (`FIRST_CHUNK_TIMEOUT_MS`, wired via `boundFirstChunk` in
  `packages/core/src/chat/run.ts:349-352`) and aborts with `"<harness> produced no output within Ns"`
  if the CLI process itself is wedged — that's a harness/CLI problem (wrong binary, CLI stuck on its
  own prompt), not the approval gate; see the conciv-harness skill if you're debugging a specific
  adapter.

## Failure scenario 4: an approval never resolves at all (not even a timeout)

- **No session ID.** `makeAskGate` returns `'deny'` immediately, before opening any ask or emitting
  any event, whenever `deps.sessionId` is empty (`packages/core/src/chat/gate.ts:104`). This is a
  silent, instant deny with nothing shown to the user — if a tool call fails immediately with a
  generic denial and no approval card ever rendered, check whether the session ID reaching the gate
  is actually populated.
- **Reply race.** `AskRegistry.reply` only settles an ask that is still open for that exact
  `sessionId`/`key` pair (`packages/core/src/chat/ask.ts:74-80`); a reply that arrives after the
  120s timeout already fired, or against a session ID that doesn't match what opened the ask, is
  dropped — `reply` returns `false` and nothing happens. If the widget's Approve/Deny buttons appear
  to do nothing, confirm the click is posting against the same session the ask was opened on.
- **Timeout is a `null` decision, not a crash.** `waitFor`'s timeout resolves the ask with `null`
  (`packages/core/src/chat/ask.ts:81-84`), which `approvalRefusal` maps to the `'timeout'` branch, not
  `'deny'` — the wording differs (`"received no approval decision (the ask timed out)"` vs `"was
denied by the user"`), which is useful when reading logs to tell an actual user click from a stale
  timeout.

## Failure scenario 5: SSE stream never settles, tests hang

Chat streaming is long-lived by design: `subscribeSession` (`packages/core/src/chat/subscribe.ts:32-61`)
yields a snapshot, then stays open pumping chunks from `deps.stream.listen` and any live run until the
caller's `AbortSignal` fires — there is no natural "idle" point while a session is mounted. Two
consequences:

- **Playwright's `page.waitForLoadState('networkidle')` never resolves** against a page with the live
  widget open, because the SSE connection keeps the network non-idle forever. Wait for
  `'domcontentloaded'`, or for a concrete UI signal (an element appearing/its text changing), never
  `networkidle`. This mirrors the repo's own testing rule for widget ITs
  (`AGENTS.md` — "Never wait for Playwright `networkidle`... its SSE stream keeps the network busy
  forever").
- **A held-open browser context/page from a previous test run** keeps its stream subscribed
  server-side (`deps.stream.listen`'s unsubscribe only runs on `AbortSignal` abort or the generator's
  `finally`), so a test harness that doesn't tear pages down between runs can leak listeners and make
  `stream.listening(sessionId)` report true for a session nothing is actually watching anymore —
  which then changes which gate path (scenario 3) a later approval takes. Always `unmount()`/close the
  page, don't just navigate away.

## Red flags — stop and check the mechanism, not the symptom

- Increasing a client-side polling/retry loop instead of checking whether the widget ever reached
  `'mounted'` state (`packages/embed/src/mount.ts`) — a widget stuck in `'mounting'` will retry
  forever against nothing.
- Assuming any approval failure is a "denied by user" — read whether the message says `denied` or
  `timed out` (`packages/core/src/chat/gate.ts:75-79`); they mean different things operationally.
  and check whether `sessionId` was even populated when the gate ran.
- Reaching for `networkidle` in a new Playwright check against the live widget — it will hang, not
  flake occasionally.
- Adding a command to `READ_ONLY_COMMANDS` to silence an approval prompt without checking for a
  shell metacharacter first — `SHELL_METACHARACTER_PATTERNS` overrides any allowlist entry, so the
  fix is almost never "the command needs to be allowlisted."
- Debugging a stuck code-mode tool call as if it were the 120s ask-timeout path — it fails in
  milliseconds via `noListenerRefusal`, so a multi-second hang there points elsewhere (the harness
  CLI, not the gate).
- Debugging extension-authoring behavior (tool contracts, `Component`/`Surface` wiring) instead of
  runtime plumbing — that's the conciv-develop skill's territory; this skill covers the
  sandbox/gate/SSE runtime underneath, not how an extension is built.

## Sources

- `packages/core/src/chat/gate.ts`
- `packages/core/src/chat/sandbox.ts`
- `packages/core/src/chat/ask.ts`
- `packages/core/src/chat/run.ts`
- `packages/core/src/chat/code-mode.ts`
- `packages/core/src/chat/subscribe.ts`
- `packages/core/src/start.ts`
- `packages/core/src/lib/cors.ts`
- `packages/core/src/app.ts`
- `packages/embed/src/mount.ts`
- `packages/core/src/config.ts`
- `packages/plugin/src/core/vite.ts`
- `packages/plugin/src/index.ts`
- `apps/site/content/docs/troubleshooting.mdx`
- `apps/site/content/docs/usage/approvals.mdx`
- `AGENTS.md`
