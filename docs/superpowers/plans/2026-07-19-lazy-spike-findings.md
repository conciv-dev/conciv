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
