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

| Harness    | `capabilities.mcp` | chat-run tool path                                                                                                   |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| claude     | `'http'`           | bridge (`mcp__tanstack__*`), provisioned from `chat({tools})`                                                        |
| codex      | `'none'`           | in-process `codexText`; tools via bridge/in-proc executor                                                            |
| opencode   | `'none'`           | **not bridged** — `@tanstack/ai-opencode/dist/esm/adapters/text.d.ts:45`: "chat()-provided tools aren't bridged yet" |
| gemini-cli | `'none'`           | same generation of adapters; assume unbridged until proven otherwise                                                 |
| pi         | `'none'`           | pi-native tool contract                                                                                              |

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
