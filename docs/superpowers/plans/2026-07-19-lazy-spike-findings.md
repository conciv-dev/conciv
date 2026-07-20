# Spike findings: tool path per harness × lazy discovery reachability

Date: 2026-07-19. Task 1 of `2026-07-19-lazy-discovery-code-mode.md`, extended with the
reviewer-raised questions (gate firing, cross-turn discovery persistence).

## How tools actually reach each harness

Two distinct MCP surfaces exist, and neither is the one the plan assumed:

1. **The sandbox tool bridge** (`@tanstack/ai-sandbox` `tool-bridge`): `chat({tools})` is
   provisioned into an in-sandbox MCP server named `tanstack`; the CLI sees
   `mcp__tanstack__<name>`; adapter stream translators strip the prefix
   (`@tanstack/ai-claude-code/dist/esm/adapters/text.js:164-167` — `provisioner.provision(options.tools ?? [])`
   when `options.tools` non-empty). This is the live path for chat-run tools on adapters that
   support it.
2. **conciv's own `/api/mcp`** (`packages/core/src/api/mcp.ts`, client prefix `mcp__conciv__`):
   wired into claude's **tty/launch/sdk** modes via `claudeMcpArgs`
   (`packages/harness/src/claude/args.ts:10`, `index.ts:28`, `tty.ts:9`, `sdk.ts:43`) — NOT into
   `claudeChatConfig` (`packages/harness/src/claude/chat.ts` builds `claudeCodeText` with no
   `mcpUrl`). Chat turns do not use it; external/interactive agents do.

Per harness (`packages/harness/src/*/index.ts`):

> **SUPERSEDED 2026-07-20 by the observed harness matrix at the end of this document.** Two claims in
> the table below were wrong: opencode DOES bridge `chat()` tools, and `capabilities.mcp: 'none'`
> does not mean tools fail to reach the CLI. Read the matrix, not this table.

| Harness    | `capabilities.mcp` | chat-run tool path                                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| claude     | `'http'`           | bridge (`mcp__tanstack__*`), provisioned from `chat({tools})`                                     |
| codex      | `'none'`           | in-process `codexText`; tools via bridge/in-proc executor                                         |
| opencode   | `'none'`           | ~~**not bridged**~~ WRONG — stale `.d.ts` comment; the shipped `.js` bridges. See the matrix.     |
| gemini-cli | `'none'`           | ~~assume unbridged~~ UNVERIFIED THEN, now observed: bridged but blocked upstream. See the matrix. |
| pi         | `'none'`           | pi-native tool contract — stub harness, never spawns a CLI                                        |

## Does chat()-level `lazy: true` reach the CLIs?

**Yes for the visible list, with one hard gap.** `chat()` hands adapters its ACTIVE tool set
(`LazyToolManager.getActiveTools()`), so a bridged CLI is provisioned with eager tools plus
`__lazy__tool__discovery__` — the context reduction lands inside the CLI's own prompt, which is
where the pollution actually lives. The gap:

- **The bridge is static per provision.** `@tanstack/ai-sandbox` has no `tools/list_changed`,
  no dynamic registration, no lazy awareness (verified by grep over its dist). A tool discovered
  mid-turn is returned as schema text but is NOT callable as an MCP tool until the next
  provision (next turn/spawn).

## Cross-turn discovery persistence (reviewer finding)

`LazyToolManager` re-derives discovered state each `chat()` call by scanning message history for
the synthetic discovery call + its `role: 'tool'` result. Combined with the static bridge, the
usable flow on bridged harnesses is: discover in turn N → callable in turn N+1 — but ONLY if
conciv's persisted history retains those synthetic messages. claude has
`transcriptHistory: true` (history merges from the CLI transcript by msgid) — the synthetic
discovery messages are chat()-layer constructs, so whether they survive the merge is UNVERIFIED
and must be tested before relying on lazy for claude.

## Approval-gate reality check (security reviewer, confirmed against source)

- Risky set: `mcp__conciv__<name>` for `approval: 'ask'` tools (`packages/core/src/app.ts:155`).
- Chat-middleware gate compares BARE names (`packages/core/src/chat/gate.ts` `gatedTools` →
  `gate.decide(tool.name, ...)`); bridge-visible names are `mcp__tanstack__<name>`. Three name
  formats, one set: only the `mcp__conciv__` CLI-callback path matches. In-process/no-callback
  harnesses (codex: `permissionGate: 'none'`) execute 'ask' tools UNGATED today. Pre-existing
  bug, inherited by the plan, must be fixed in this work: normalize names at the gate (strip
  known `mcp__<server>__` prefixes and match bare names).

## GO / ADAPT decision

**ADAPT**, three amendments:

1. **Lazy stays at chat() level (Task 4 unchanged)** — it correctly shrinks what bridged CLIs
   see. Accept discover→next-turn callability for v1 IF the persistence test passes; file an
   upstream issue on `@tanstack/ai-sandbox` for `tools/list_changed` re-provisioning. If
   persistence fails, lazy for bridged harnesses is a no-go until history retention is fixed
   in conciv's attach/session layer (Task 4 gains that fix as a precondition).
2. **Task 5 (MCP parity) is real but re-scoped**: `/api/mcp` serves tty/launch/sdk modes and
   external agents — apply the same lazy split there via the MCP SDK's dynamic registration +
   `sendToolListChanged` (the SDK supports it even though the sandbox bridge does not).
3. **Gate normalization becomes a new task** (before enabling anything): risky matching must be
   prefix-agnostic; add per-harness gate-firing tests for an `approval: 'ask'` tool.

## Code Mode consequences

`execute_typescript` is ONE eager tool through the bridge — static provisioning is a non-issue
for it, and its `code_mode:*` events flow through the bridge's `emitCustomEvent` (explicitly
supported: `tool-bridge.d.ts` documents code mode console events). Code Mode is therefore the
LEAST bridge-sensitive way to expose many tools to CLI harnesses: verified viable for claude
first, with the reviewer-mandated fixes (real sessionId threading, per-tool `codeMode` opt-in,
`probeIsolatedVm` fail-closed at startup, wire `codeMode.tools` not `codeMode.tool`).

---

## EMPIRICAL RESULTS (Task 1, appended 2026-07-19)

Two artifacts back these results:

1. **Committed deterministic proof** — `packages/core/test/chat/lazy-extension-tools.it.test.ts`
   (4 tests, always-run, no real CLI). Drives `@tanstack/ai`'s `chat()` directly with a
   recording adapter (via `@conciv/harness` `makeTextAdapter`) and conciv's own tool-construction
   seam (`toChatTool` for the eager tool; `toolDefinition({lazy: true}).server(...)` for the lazy
   tool — the exact shape Task 4 will emit). It pins the `chat()`-layer contract:
   - Initial model call is offered the eager tool + `__lazy__tool__discovery__` and **never** the
     undiscovered lazy tool.
   - The discovery catalog honors `lazyToolsConfig: {includeDescription: 'first-sentence'}` — it
     carries the lazy tool's first sentence only, not its full prose (this is exactly the config
     Task 4 sets in `run.ts`).
   - Calling discovery returns the lazy tool's full JSON schema, and the tool becomes offered on
     the **next** model call within the same `chat()` invocation.
   - When the discovery call + `role: 'tool'` result messages are threaded into a second `chat()`
     call's `messages`, `LazyToolManager.scanMessageHistory` re-derives the discovered state and the
     lazy tool is offered from the first model call of turn 2 with **no** re-discovery.

   This is the load-bearing invariant Task 4 depends on: chat()-layer lazy works, and cross-turn
   persistence works **iff the synthetic discovery messages are present in `messages`**.

2. **Real claude bridge run** — a throwaway `chat()`-driven turn against the local claude binary
   (`claude 2.1.215`, native install, authenticated; run via a temporary core vitest, since the
   real adapter needs the package's node_modules to resolve; deleted after recording). Two real
   turns, tools `[demo_status (eager), demo_search (lazy)]`, `lazyToolsConfig: first-sentence`,
   auto-allow gate, real conciv sandbox + gate middleware — the same wiring `run.ts` uses.

   **Turn 1 (discover + use in the same turn):**
   - Tool calls observed: `["__lazy__tool__discovery__", "demo_search", "__lazy__tool__discovery__"]`
   - `demo_search.execute` **never ran** (side-effect log empty).
   - claude's own words: `No such tool available: mcp__tanstack__demo_search`.

   **Turn 2 (resume of the same session):**
   - Tool calls: `["demo_search"]` — `demo_search.execute` still **never ran**; same failure.

### Answer (a): is a mid-run-discovered tool callable within the same turn through the claude bridge?

**NO — confirmed empirically.** claude's CLI runs its _entire_ agentic turn inside one spawn; the
adapter's `chatStream(options)` provisions the tool bridge exactly once, from the initial
`getActiveTools()` set (eager + discovery, **not** the lazy tool), then relays claude's NDJSON.
`chat()`'s `LazyToolManager` re-provision loop is never re-entered mid-turn for claude. The
discovery tool _is_ provisioned (it is in the initial active set) and _does_ execute in-process,
returning the schema — but the discovered tool itself is never registered on the static bridge, so
the CLI's `mcp__tanstack__demo_search` call fails with `No such tool available`. Root cause:
`@tanstack/ai-sandbox`'s tool bridge has no `tools/list_changed` / dynamic registration (verified
against dist in the static analysis above; now confirmed at runtime).

### Answer (b): do the synthetic discovery messages survive conciv's persisted history across turns for a `transcriptHistory: true` harness (claude)?

**NO — and worse than the plan feared.** The failure is not in a merge dropping the messages by
msgid; conciv never hands them to `chat()` at all. `historyFor` (`packages/core/src/chat/run.ts`)
returns `[]` whenever the session is resumable, because claude resumes from its **own** CLI
transcript rather than conciv's merged messages. So turn 2's `chat()` receives only the new user
message; the fresh `LazyToolManager` scans that, finds no discovery call, and leaves `demo_search`
undiscovered → it is not provisioned into turn 2's bridge either. Net: **chat()-level lazy
extension tools are never callable on claude** — not same-turn (static bridge) and not cross-turn
(resume bypasses the `messages` array the manager scans). The scripted test proves the cross-turn
mechanism _does_ work when the discovery messages are threaded into `messages`; claude's resume
path is precisely what prevents that threading.

### GO / ADAPT refinement (supersedes the amendment-1 wording above)

- **Raw `lazy: true` extension tools are a NO-GO for claude as wired today.** They correctly shrink
  what the CLI sees (context win holds), but the model can discover a tool and then cannot call it —
  a strictly worse UX than eager tools. Marking extension tools `lazy` (Task 4) is safe to land only
  behind one of these preconditions for any bridged, resume-based harness (claude):
  1. **Code Mode (preferred, already the plan's Task 7).** One eager `execute_typescript` tool is
     always provisioned; the many extension tools become in-sandbox bindings reached through it, so
     no bridge re-provisioning is ever needed. This is the empirically-supported path for exposing
     many tools to claude. Task 7 stands; its importance is upgraded from "least bridge-sensitive" to
     "the only bridge-viable multi-tool surface for claude."
  2. **Thread the synthetic discovery messages into `chat()` `messages` even on resume** — i.e.
     `historyFor` must stop returning `[]` for the discovery call + result pair (or conciv must
     replay a compacted discovery preamble). Without upstream `tools/list_changed`, this still only
     yields discover-in-turn-N → callable-in-turn-N+1, never same-turn. Treat as a Task 4
     precondition **only if** we want raw lazy extension tools on claude at all; given (1), we may
     simply **not** mark bridged-harness extension tools lazy and lean on Code Mode instead.
- **Task 4 as written (mark all extension tools `lazy: true` globally) must be re-scoped:** either
  gate `lazy` on a harness capability (only enable for harnesses whose adapter re-provisions per
  model round — none today), or keep extension tools eager on claude and expose the bulk via Code
  Mode. Do not ship global `lazy: true` for claude expecting discovered tools to be callable.
- Amendments 2 (MCP parity re-scope) and 3 (gate normalization) are unchanged.

### Upstream issue to file (DRAFT — do not file yet; user verifies before anything leaves the machine)

Target repo: `@tanstack/ai-sandbox` (the tool-bridge provisioner). File under the TanStack AI repo.

> **Title:** Tool bridge is static per provision — lazy-discovered tools are never callable through
> CLI adapters (claude-code)
>
> **Body:**
>
> When `chat()` is used with `lazy: true` tools and a CLI adapter that provisions the sandbox tool
> bridge once per model turn (e.g. `@tanstack/ai-claude-code`), a tool the model discovers mid-turn
> via `__lazy__tool__discovery__` is returned with its schema but is **not callable**: the CLI
> reports `No such tool available: mcp__tanstack__<name>`.
>
> Root cause: the bridge provisioned by `@tanstack/ai-sandbox` from `options.tools` is static for
> the life of the spawn. There is no `tools/list_changed` notification and no dynamic
> registration, so when `LazyToolManager.getActiveTools()` grows after a discovery call, the newly
> active tool never reaches the running MCP bridge. CLI adapters that run their whole agentic loop
> in a single spawn (claude-code) never re-enter `chatStream`, so the growth is never provisioned.
>
> **Reproduction:** `chat({adapter: claudeCodeText, tools: [eager, {…, lazy: true}],
lazyToolsConfig: {includeDescription: 'first-sentence'}})`; prompt the model to discover then
> call the lazy tool. Observed: discovery succeeds, the lazy tool call fails with
> `No such tool available`, and the tool's `execute` never runs.
>
> **Ask:** either (1) support `tools/list_changed` + dynamic (re-)registration on the sandbox tool
> bridge so a lazy tool discovered mid-turn becomes callable, or (2) document that `lazy: true` is
> unsupported for single-spawn CLI adapters and have the adapter provision the full (non-lazy)
> tool set so discovered tools are at least callable. Today `lazy` silently produces
> discoverable-but-uncallable tools on these adapters.

## Approval audit (Task 6b step 4b)

Every `defineTool`/tool-def across `packages/extensions/*` and `packages/tools` classified. Rule
applied: a tool that **destroys or removes** user content, or executes/spawns outside the draft,
gets `approval: 'ask'`; additive/draft-only/read-only tools stay unguarded. Bias is conservative —
only tools already flagged were flagged; no new flags were added because none of the unguarded
tools are clearly destructive (see judgment calls below).

### Whiteboard — canvas (`packages/extensions/whiteboard/src/tool/canvas/def.ts`)

| Tool           | approval | Classification                                                                        |
| -------------- | -------- | ------------------------------------------------------------------------------------- |
| canvas.read    | —        | Read-only.                                                                            |
| canvas.svg     | —        | Writes to the **hidden draft** only; reversible via canvas.discard; commit publishes. |
| canvas.draw    | —        | Draft only, reversible.                                                               |
| canvas.diagram | —        | Draft only, reversible.                                                               |
| canvas.connect | —        | Additive (draws a binding arrow); non-destructive.                                    |
| canvas.update  | —        | Edits an existing element in place; non-destructive, reversible on the shared canvas. |
| canvas.delete  | **ask**  | Destructive — removes an element. Guarded. ✓                                          |
| canvas.clear   | **ask**  | Destructive — wipes every element. Guarded. ✓                                         |
| canvas.export  | —        | Read-only export (json/png).                                                          |
| canvas.commit  | —        | Publishes the agent's own draft; additive, non-destructive.                           |
| canvas.discard | —        | Discards only the agent's uncommitted draft, never published/user content.            |
| canvas.preview | —        | Read-only PNG of the draft.                                                           |

### Whiteboard — comment (`packages/extensions/whiteboard/src/tool/comment/def.ts`)

| Tool            | approval | Classification                                               |
| --------------- | -------- | ------------------------------------------------------------ |
| comment.create  | —        | Additive (pins a note).                                      |
| comment.reply   | —        | Additive (threaded reply).                                   |
| comment.read    | —        | Read-only.                                                   |
| comment.list    | —        | Read-only.                                                   |
| comment.resolve | **ask**  | State change on user content. Guarded. ✓                     |
| comment.delete  | **ask**  | Destructive — removes a comment/thread + its pin. Guarded. ✓ |
| comment.move    | —        | Repositions a pin; non-destructive, reversible.              |
| pin.setState    | —        | Sets pin lock/offset; non-destructive.                       |

### Whiteboard — element / anchor

| Tool              | approval | Classification              |
| ----------------- | -------- | --------------------------- |
| element.reference | —        | Read-only component lookup. |
| anchor.resolve    | —        | Read-only drift check.      |

### Recorder (`packages/extensions/recorder/src/tool/def.ts`)

| Tool            | approval | Classification                                                 |
| --------------- | -------- | -------------------------------------------------------------- |
| recording_start | —        | Starts observing the user's own page; non-destructive.         |
| recording_stop  | —        | Stops + returns an action log/keyframes; observation only.     |
| recording_pull  | —        | Reads the last N seconds of the always-on recorder; read-only. |

### Test runner (`packages/extensions/test-runner/src/tool/def.ts`)

| Tool        | approval | Classification                                                                     |
| ----------- | -------- | ---------------------------------------------------------------------------------- |
| test_runner | —        | list/status are read-only; `run` spawns the **configured** test runner. See below. |

### conciv built-in tools (`packages/tools/src`)

`ConcivServerTool` (`packages/tools/src/types.ts`) has **no `approval` field**, and these tools are
not part of `opts.extensions`, so the extension risky set in `app.ts` never covers them. They are
therefore outside the approval-gate mechanism this task hardens (the chat-middleware Bash gate and
the extension `approval: 'ask'` path).

| Tool              | mutates? | Classification                                                                             |
| ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| conciv_ui         | no       | Asks the user a question; the user answers. Non-mutating.                                  |
| conciv_page       | **yes**  | Reads and **drives** the user's live dev-page DOM (click/fill/submit/override). See below. |
| conciv_open       | no       | Opens a file in the editor; does not write.                                                |
| conciv_extensions | no       | catalog/scaffold/validate return code strings; the model writes files, not this tool.      |

### Judgment calls (unguarded but reviewed)

- **test_runner.run** — spawns the project's configured test runner (bounded to list/run/status with
  a pattern, not arbitrary shell). Developer-initiated dev action on their own project; not
  destructive in the delete-records/write-files sense. Left unguarded, consistent with the
  command-policy philosophy where non-destructive dev commands run freely. Flag candidate only if
  product decides test execution warrants a prompt.
- **conciv_page** — drives the user's own local dev page in their own browser (the product's core
  inspect-and-drive loop). Mutating, but scoped to the user's app, developer-initiated, and gating
  every DOM action would break the loop. The `ConcivServerTool` contract has no `approval` field and
  this path is not covered by the extension risky set, so guarding it would be a separate design
  change, not a fix to the hole this task closes. Documented decision, not a defect.

### Net change

No `approval` flags were added or removed. The two destructive canvas tools (delete, clear) and two
destructive comment tools (resolve, delete) were already flagged and remain the only guarded
extension tools; the fix in this task is what makes those four flags actually fire on the scripted
in-process path (previously bypassed by the prefix mismatch).

---

## Task 7 redesign (user decision, 2026-07-19)

The plan's Task 7 (opt-in `codeMode: true` flag, `approval: 'ask'` tools EXCLUDED from Code Mode,
non-lazy bindings) was superseded by an explicit user decision: **wrangler/Cloudflare-style —
everything reachable through Code Mode, nothing broken anywhere, approvals still fire.** What
actually shipped in `packages/core/src/chat/code-mode.ts`:

- **All extension tools are bound.** No `codeMode` opt-in field on `ExtensionTool`/`ExtensionServerTool`
  (never added). `makeCodeMode(extensionTools, request, gate)` binds every tool via `toChatTool`.
- **Bindings are lazy + the discovery companion is kept.** Each binding is built with
  `toChatTool(tool, run, {lazy: true})`, so `createCodeMode` filters them all into the "Discoverable
  APIs" catalog (kept out of the eager system-prompt docs) and returns the `discover_tools`
  companion. We wire `codeMode.tools` (PLURAL — `[execute_typescript, discover_tools]`) into
  `chat({tools})`, not just the single tool. Verified against the installed dist
  (`@tanstack/ai-code-mode@0.3.7`): `createCodeMode` (`create-code-mode.js`) does
  `config.tools.filter(t => t.lazy)` → builds `discover_tools` iff any lazy tool exists, and returns
  `{tool, discoveryTool, tools, systemPrompt}`. Critically, `createCodeModeTool`
  (`create-code-mode-tool.js`) binds ALL tools as callable `external_*` sandbox functions
  (`toolsToBindings(tools)`) regardless of `lazy` — `lazy` only controls documentation placement, so
  an all-lazy set stays fully reachable through `discover_tools` + `execute_typescript`.
- **Approval-gated tools are gate-wrapped, not excluded.** `gatedToolRun(tool, request, gate)`
  consults the SAME run gate instance the chat middleware uses (`makeRunGate` in `buildRunStream`) via
  `gate.decide(tool.name, input, sessionId, randomUUID())` BEFORE calling `tool.execute`. On `deny`
  it throws a structured refusal (matching the existing `gatedTools` precedent in `gate.ts`), which
  the isolate driver surfaces to the sandbox as an error result — never a silent success. On `allow`
  it executes. Security-critical, covered by `code-mode.test.ts` `gatedToolRun` tests against the
  real `makeRunGate` (deny → execute never runs + throws; allow-reply → executes and returns).
- **Timeout choice: `CODE_MODE_TIMEOUT_MS = 150_000`.** Verified path: the code-mode `timeout` flows
  to `IsolateContext.execute` → isolated-vm `script.run({timeout, promise: true})`
  (`ai-isolate-node/isolate-context.js`), bounding the sandbox script's execution. `gate.ts` sets
  `APPROVAL_TIMEOUT_MS = 120_000`. 150s > 120s guarantees a sandbox script that triggers one
  approval-gated tool and waits the full approval window is not killed mid-wait, whether the wait
  counts as CPU or wall-clock time. CAVEAT: a single `execute_typescript` that sequentially triggers
  multiple approvals could still exceed 150s if the timeout is wall-clock; the single-approval case
  (the requirement) is safe.
- **Driver: probe-gated module singleton, fail closed.** `getDriver()` returns a cached
  `createNodeIsolateDriver(...)` only if `probeIsolatedVm().compatible`; otherwise `null` →
  `makeCodeMode` returns `null` and no code-mode tools/prompt are wired. No mid-run throw (isolated-vm
  on an incompatible Node segfaults the 127.0.0.1 server). Verified export names + probe field
  (`{compatible, error?}`) against `ai-isolate-node/dist/esm/isolate-driver.{d.ts,js}`.
- **Real session threading + capability gating.** `buildRunStream` calls `makeCodeMode` only when
  `deps.harness.capabilities.codeMode` is true, with `{sessionId, model: req.model ?? null}` — never
  an empty sessionId. `codeMode?: boolean` added to `HarnessCapabilities`
  (`packages/protocol/src/harness-types.ts`); set `true` ONLY on the claude harness. `ChatDeps` gained
  `extensionServerTools: () => ExtensionServerTool[]`, wired from `makeApp` to reuse the same
  `extensionTools` array handed to `buildChatTools`.
- `toChatTool`'s return type was widened from `AnyTool` to `ServerTool` so the bindings carry the
  `__toolSide: 'server'` brand `createCodeMode` requires (`ServerTool` is still assignable to
  `AnyTool`, so all existing callers are unaffected).

---

## Task 5 implementation notes (`/api/mcp` lazy projection)

The `/api/mcp` route now mirrors the chat-path lazy split: `tools/list` initially exposes only the
conciv core tools plus `conciv_discover_tools`; every extension tool is hidden until discovered.
`conciv_discover_tools` takes `{names: string[]}` (zod-validated via the SDK `registerTool`
`inputSchema` shape), returns `{discovered: [{name, description, inputSchema}], unknown: [...]}` per
requested name (JSON Schema via `z.toJSONSchema`, zod 4.4.3), and never calls `tool.execute` — pure
metadata. Discovered names are additive to the session's set; the newly discovered tools appear in
`tools/list` and become callable on the NEXT request in the same conciv session.

- **Stateless-server adaptation.** `buildServer` builds a FRESH `McpServer` per POST
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), so there is no long-lived server and
  `sendToolListChanged`/dynamic live registration is meaningless. The correct mechanic is a
  per-session discovered-names store consulted at build time: each POST registers core tools +
  `conciv_discover_tools` (registered whenever any extension tool exists) + only the extension tools
  whose names are in the session's discovered set. Discovery mutates the set; the following POST's
  freshly built server reflects it. No second server, no renamed tools — invariant (a) holds.
- **Store seam: owned by `McpVars`, not module scope.** `McpVars.mcp` gained
  `discovered: Map<string, Set<string>>`, created in `makeApp` (`new Map()`). This ties the store's
  lifetime to the app instance. A module-scoped Map would leak discovered state across independent
  `makeApp` instances in one process (the testkit boots many), so the app-owned seam is both cleaner
  and correct for isolation. Keyed by `sessionIdFromHeaders(...) ?? ''`.
- **Anonymous-bucket caveat.** External agents may omit `conciv-session-id`; those requests share the
  `''` bucket, so one anonymous caller's discoveries are visible to another anonymous caller. Accepted
  for v1 — the server binds `127.0.0.1` only and interactive/external agents are trusted local
  processes. Real conciv sessions (chat, claude tty/launch/sdk) always carry a branded session id and
  get isolated buckets.
- **Client-side gating unchanged (invariant c).** The `/api/mcp` execute path has NO server-side
  approval gate today — gating for this surface is the CLI's own permission callback fed by the risky
  set. This task does not change that. What holds server-side, and what the test asserts: a discovered
  `approval: 'ask'` tool registers under its UNCHANGED bare name (`acme_delete`, surfaced client-side
  as `mcp__conciv__acme_delete`), and `riskyMatches` (Task 6b) strips the `mcp__conciv__` prefix and
  matches the bare-name risky set — so `riskyMatches(risky, 'mcp__conciv__acme_delete')` is true.
  Lazy discovery does not rename or un-risk the tool.
- **Downstream fallout (contract change, v0).** Extension tools are no longer eagerly listed on
  `/api/mcp`, so the shared testkit seam `makeCallTool` (`packages/harness-testkit/src/call-tool.ts`)
  now discovers a tool before calling it (only when it is not already listed, so core tools and
  extension-free apps are unaffected) — this is the real client flow. Direct-client ITs that asserted
  eager extension listing (`packages/core/test/api/**`, recorder + test-runner extension ITs) were
  updated to `callTool('conciv_discover_tools', {names})` before listing/executing.

---

## OBSERVED HARNESS MATRIX (2026-07-20)

Method: a dotted tool `probe.ping` built through conciv's real `toChatTool`, passed as `chat({tools})`
through each harness's real `chatConfig` with the real conciv sandbox + gate middleware. `execute`
incremented a counter and returned a sentinel token, so execution is proven by side effect, not by
absence of error. Every row below is OBSERVED against a real CLI except where marked.

| Harness    | CLI available | Tool ran           | Literal `part.name` observed | Dot           |
| ---------- | ------------- | ------------------ | ---------------------------- | ------------- |
| claude     | yes           | YES                | `probe_ping`                 | lost -> `_`   |
| codex      | yes           | YES (fixed, below) | `probe.ping`                 | preserved     |
| opencode   | yes           | YES                | `tanstack_probe_ping`        | lost + prefix |
| gemini-cli | yes           | **NO** (hangs)     | _(no tool part emitted)_     | UNVERIFIABLE  |
| pi         | **no**        | NO                 | _(stub harness, RUN_ERROR)_  | n/a           |

### Three name forms, none of them the registered name — FIXED 2026-07-20

No harness delivers `part.name === 'canvas.read'`. A card keyed on the registered dotted name matches
only on codex. `canonicalToolName` (`packages/harness/src/claude/blocks.ts`) strips only
`mcp__conciv__` and handles neither observed form. Any card work needs a normalization seam in
`packages/core` before parts reach the widget: strip a leading `tanstack_` / `mcp__<server>__`, then
map `_` back to `.` against the registered tool names (lossless both ways — `canvas.read` and a
hypothetical `canvas_read` must stay distinguishable).

**Shipped:** `makeToolNameNormalizer` (`packages/core/src/chat/tool-names.ts`), applied in
`mergedMessages` (`packages/core/src/chat/attach.ts`) — the single seam both the widget snapshot and
`historyFor` read from. Registered names come from `ChatDeps.toolNames` (built in `makeApp` from the
same tool list the chat uses). Lossless by construction: exact registered names always win; a strip or
`_`→`.` mapping is applied only when it lands on exactly one registered name; everything else
(CLI-native `Bash`, foreign `mcp__playwright__*`) passes through untouched. Covered by unit tests +
a wire IT (`tool-name-normalization.it.test.ts`) asserting all three observed forms reach the widget
snapshot as the registered name.

### codex: tools have never run (OUR bug) — FIXED 2026-07-20

Root cause isolated to `sandboxMode` in `packages/harness/src/codex/index.ts`:

- `workspace-write` (shipped) -> `TOOL_CALL_RESULT {"content":"user cancelled MCP tool call"}`, 0 execute hits
- `workspace-write` + `networkAccessEnabled: true` -> still cancelled, 0 hits
- `danger-full-access` + `networkAccessEnabled: true` -> executes, 1 hit

**Real root cause (read from codex-rs 0.139.0 source, not guessed):** the sandbox never blocked the
loopback bridge — codex requires a PER-TOOL APPROVAL for MCP tool calls, and
`mcp_permission_prompt_is_auto_approved` (`codex-rs/codex-mcp/src/mcp/mod.rs:70`) auto-approves under
`approval_policy = never` only when the sandbox policy `has_full_disk_write_access()`. That is why
`danger-full-access` "fixed" it: it flipped the approval short-circuit, not network/sandbox access.
Under `codex exec` (non-interactive) the prompt can never be answered, so
`McpToolApprovalDecision::Cancel` produces `user cancelled MCP tool call`
(`codex-rs/core/src/mcp_tool_call.rs:252`).

**The narrow fix, shipped:** `mcp_servers.tanstack.default_tools_approval_mode = "approve"`
(`custom_mcp_tool_approval_mode` reads it per server; `AppToolApproval::Approve` short-circuits the
auto-approve check BEFORE the sandbox branch). Scoped to conciv's own bridge server only; sandbox
stays `workspace-write`; every bridged tool is still gate-wrapped server-side by `gateProvisioner`'s
`gatedTools`, so `approval: 'ask'` tools remain gated by conciv. Verified against the real codex CLI
(0.139.0): `probe.ping` executed (1 hit, sentinel returned), no cancellation, `part.name` still
`probe.ping` (dot preserved — matrix row unchanged).

### gemini-cli: blocked upstream, and it hangs instead of failing

`@tanstack/ai-acp` sends `mcpServers: [{name, url, headers}]` with no `type` discriminator. Gemini
rejects it:

```
{"code":-32603,"message":"Internal error","data":[{"code":"invalid_union",
"errors":[[{"code":"invalid_value","values":["http"],"path":["type"]}], ...]}]}
```

The adapter swallows that JSON-RPC error, so the turn never terminates (>300s; the identical turn
without tools finishes in 9.9s). Bare gemini ACP is healthy — `initialize`, `session/new`,
`session/prompt` all verified by hand. We do not construct that payload, so there is no conciv-side
fix that makes gemini tools work. Failing fast instead of hanging may be fixable on our side.

### Code mode emits NO per-tool parts (confirmed) — FIXED 2026-07-20

**Shipped:** `gatedToolRun` now emits `conciv:tool_call` / `conciv:tool_result` / `conciv:tool_error`
custom events through the binding's `emitCustomEvent` (the orchestrator stamps the parent
`execute_typescript` `toolCallId` into every custom-event value — `tool-calls.js` in `@tanstack/ai`
builds the tool context that way). `codeModeToolChunks`
(`packages/core/src/chat/code-mode-parts.ts`) translates those into synthetic
TOOL_CALL_START/ARGS/END/RESULT chunks in `foldRunStream`, with the REGISTERED dotted tool name and
`metadata: {parentToolCallId}` (named neutrally so subagents/batches can reuse it). Deny and throw
both produce an `output-error` result — no green dot on failure. The widget
(`packages/ui-kit-chat/src/styled/activity.tsx`) excludes child parts from top-level steps and nests
them under the parent's step inside the existing `ToolGroup`. Verified by unit tests, a real-isolate
threading test, a wire IT, and a NestedSubCalls story in real Chromium. Events drain live during
execution (`executeWithEventPolling`), so cards stream in while the script runs.

Real claude run through the real `makeCodeMode`:

```
TOOL_CALL_START  discover_tools        args: {"toolNames":["external_probe_ping"]}
TOOL_CALL_START  execute_typescript    args: {"typescriptCode":"return await external_probe_ping({});"}
CUSTOM  code_mode:external_call    {"function":"external_probe_ping","args":{}}
CUSTOM  code_mode:external_result  {"function":"external_probe_ping","result":{"token":"..."}}
TOOL_CALL_RESULT  {"success":true,"result":{"token":"..."},"logs":[]}
```

The extension tool appears ONLY as CUSTOM events under its binding name. Binding name =
`external_` (added by `@tanstack/ai-code-mode`) + conciv's `sanitizeIdentifier` dot->underscore.

### Non-determinism on claude — RESOLVED 2026-07-20

`packages/core/src/chat/run.ts` offers claude BOTH the direct lazy extension tools AND the code-mode
tools, so which path the model takes varies per turn. A card keyed on `part.name` therefore renders
on some turns and not others. The fix is not to remove a path: both paths must render the same card,
with the code-mode path nesting its tool cards under the run.

Both paths now land on the same registered name: the direct path via the name-normalization seam,
the code-mode path via the per-tool parts emitted with the registered name (both above). One card
definition per tool covers every route on every harness.

## Extension-owned card spike (2026-07-20)

`defineTool(def).render(Card)` works end to end; a card attached to `element.reference` rendered from
a real claude turn. The AGENTS.md popover-at-0,0 landmine does NOT fire for extension-owned cards:
measured tooltip content at x=1098 y=663 against a trigger at x=1101 y=695 — a 6.4px gap matching
ui-kit-system's `gutter: 6`, horizontal centers aligned to 0.15px. No console errors, no duplicate
Solid or Ark copy. Whiteboard's existing externals (`/^@conciv\//`, `/^solid-js/`) already suffice
because Ark arrives only via the external `@conciv/ui-kit-system`.

Two gotchas for whoever writes the tests:

- Extension client entries resolve to `dist` via `import.meta.resolve` in
  `packages/it/src/plugin-instance.ts`, so they do NOT hot-serve. Every card edit needs
  `pnpm turbo run build --filter=@conciv/extension-<name>`.
- A CLOSED Ark tooltip reports `x=0 y=0 w=0 h=0` because ui-kit-system's content class is
  `hidden data-[state=open]:block`. A naive "not at 0,0" assertion produces false failures — filter
  on `data-state="open"`.

## Approval strip already exists — do not build one

`packages/ui-kit-chat/src/styled/tools/tool-call-card.tsx:26-28` appends `PermissionCard` after ANY
matched tool card. An extension-owned card gets the approval strip for free; rendering its own
produces two. The spec's "CanvasOpCard incl. the approval strip" line is therefore struck.

Primitive: `packages/ui-kit-chat/src/primitives/tools/permission.tsx`. Styled:
`packages/ui-kit-chat/src/styled/tools/permission-card.tsx`. Wire: gate emits a CUSTOM
`approval-requested` event (`packages/core/src/chat/gate.ts:217-225`), part goes to
`state === 'approval-requested'` with `part.approval = {id}`, decision returns via
`ctx.respondApproval(approvalId, approved)`.

## Nesting primitive already exists

`packages/ui-kit-chat/src/styled/tool-group.tsx` — collapsible container, `active` shimmer, arbitrary
children. What is missing is the WIRE linkage: nothing tells the widget which tool parts belong to
which `execute_typescript` run. Correlation must stamp a parent tool-call id at emit time; grouping
by order alone breaks on concurrent calls (`Promise.all`), two scripts in one turn, and a tool called
both directly and from a script in the same turn. Name the field neutrally (parent tool-call id), not
code-mode-specific, so subagents and batched calls can reuse it.
