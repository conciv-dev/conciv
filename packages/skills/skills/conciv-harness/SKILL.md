---
name: conciv-harness
description: Use when wiring a new coding-agent CLI into conciv as a harness adapter — implementing HarnessAdapter/defineHarness, HarnessCapabilities, chatConfig() text-adapter wiring, or the models/history/tty/commands sidecars. Also use when a harness turn misbehaves around cwd, resume, or transcript history.
metadata:
  package: '@conciv/skills'
---

# Building a conciv harness adapter

## Overview

A harness adapter is a plain object that tells conciv how to talk to one coding-agent CLI: what
capabilities it has, how to launch it, and how to turn its output into `@tanstack/ai` stream chunks.
`HarnessAdapter` (`packages/harness/src/_shared/contract.ts`) is capability-typed: the `capabilities`
field you declare determines, at compile time, which sidecar fields become required. Get a capability
flag wrong and TypeScript rejects the adapter, not a runtime check.

The one documented failure mode this skill exists to prevent: an adapter that spawns or decodes the
CLI itself, or special-cases the harness id in core/widget code, instead of returning a
`@conciv/ai/server` text adapter from `chatConfig()` and letting `chat()` (with the conciv sandbox
and its approval policy) own the process lifecycle. Every existing adapter (`claude`, `codex`) goes
through that one seam — a new harness that bypasses it duplicates process management, loses abort
handling, and loses the sandbox's `dir`-scoped filesystem.

## The shape

```ts
export const yourHarness = defineHarness({
  id: 'your-cli',
  binName: 'your-cli',
  displayName: 'Your CLI',
  capabilities: {
    resume: true,
    permissionGate: 'none',
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'http',
    slashCommands: 'none',
    imageInput: false,
    init: 'none',
  },
  chatConfig: yourChatConfig,
  models: [{id: 'default', name: 'Default', group: 'Your CLI'}],
  defaultModel: 'default',
  history: yourHistory,
})
```

(`packages/harness/src/codex/index.ts:21-52`, the smallest complete adapter in the repo — no
`attach`, `tty`, or `commands`.) Register it in `packages/harness/src/registry.ts` (`for (const adapter
of [claude, codex, geminiCli, opencode, pi]) registerHarness(adapter)`,
`packages/harness/src/registry.ts:31`) and add its docs entry to
`apps/site/content/docs/harnesses.mdx`.

## HarnessCapabilities: flags that gate the type, not just behavior

```ts
export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'callback' | 'none'
  transcriptHistory: boolean
  compaction: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'
  slashCommands: 'live' | 'files' | 'none'
  imageInput: 'native' | 'fileRef' | false
  init: 'files' | 'none'
}
```

(`packages/protocol/src/harness-types.ts:4-18`.) Three of these flags are load-bearing for the type
checker — `HarnessAdapter` is an intersection of three conditional pairs
(`packages/harness/src/_shared/contract.ts:36-48`):

- `capabilities.transcriptHistory: true` ⇒ `history: HarnessHistory` is REQUIRED. `false` ⇒ `history`
  must be `undefined` (omit the field entirely).
- `capabilities.slashCommands: 'live' | 'files'` ⇒ `commands: HarnessCommands` is REQUIRED. `'none'` ⇒
  omit `commands`.
- `capabilities.init: 'files'` ⇒ `init: HarnessInit` is REQUIRED. `'none'` ⇒ omit `init`.

There is no matching compile-time link for `resume`, `permissionGate`, `compaction`, `systemPrompt`,
`mcp`, or `imageInput` — those are read at runtime by `packages/chat/src/turn.ts` (e.g.
`deps.harness.capabilities.resume` gates whether a resume token is used,
`packages/chat/src/turn.ts:72-80`; `deps.harness.capabilities.compaction` picks `/compact` vs a
fallback prompt, `packages/chat/src/turn.ts:115-117`). Declare them honestly: `resume: false` when
your CLI has no session-resume flag, `mcp: 'none'` when it can't accept an MCP server URL, and so on —
core branches on these values to decide what to even attempt.

If your CLI genuinely has none of resume/history/commands/init, the minimal legal capabilities are
`{resume: false, permissionGate: 'none', transcriptHistory: false, compaction: false, systemPrompt:
'none', mcp: 'none', slashCommands: 'none', imageInput: false, init: 'none'}` and the adapter needs
only `chatConfig`.

## chatConfig(deps): the one required function

```ts
export type HarnessChatDeps = {
  cwd: string
  sessionId: SessionId
  resumeSessionId: HarnessSessionId | null
  model?: string
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact'
  hasTools?: boolean
}

export type HarnessChatConfig = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
}
```

(`packages/protocol/src/harness-types.ts:98-106`, `packages/harness/src/_shared/contract.ts:15-19`.) `chatConfig` is a plain function, `deps =>
HarnessChatConfig` — no async, no side effects at call time. Its `adapter` comes from a
`@conciv/ai/server` factory for CLIs that have one (`codex`, `claudeCode`, `opencode`, `acp`, thin
typed wrappers over the published `@tanstack/ai-*` adapters); if none exists for your CLI, build one
with `makeTextAdapter(name, stream)` from `packages/ai/src/adapters/adapters.ts`, where `stream` is your own
`AsyncIterable<ChatEvent>` producer. Harness code never imports `@tanstack/ai*` directly. Prefer **declaring** the launch command and letting the adapter
run it, the way `acpChatConfig` hands `acp` a `command` builder and
`permissions: 'interactive'` (`packages/harness/src/_shared/acp.ts:4-13`): everything launched that way
runs under `withSandbox`'s lifecycle. Reaching for `node:child_process` inside your `stream` steps
outside the sandbox and its abort handling (see the sandbox-virtual workdir section below).

Canonical call site — codex, which needs no message prep:

```ts
const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexAdapter(deps.model ?? 'gpt-5.5', {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    ...(deps.hasTools ? {config: bridgeApproveConfig} : {}),
    env: definedEntries(deps.env),
  }),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})
```

(`packages/harness/src/codex/index.ts:11-19`.) `deps.env` is `Record<string, string | undefined>`
(it's `process.env`-shaped); most `@tanstack/ai-*` adapters want `Record<string, string>`, so run it
through `definedEntries` (`packages/harness/src/_shared/env.ts:1-3`) to drop the `undefined` values
rather than casting.

`prepareMessages` is where you rewrite the turn before it reaches the adapter — e.g. claude's chat
config swaps in image file references or a literal `/compact` prompt depending on `deps.kind`
(`packages/harness/src/claude/chat.ts:70-83`). Only add it if your CLI needs message-shape
translation; most adapters omit it.

## `chat()` owns the turn — you never spawn or decode the CLI in core/widget

`packages/chat/src/turn.ts:186-194` is the only call site that invokes `chatConfig`; the plan it
returns reaches `chat()` in `run` (`packages/ai/src/server/chat-server.ts:377-420`):

```ts
return chat({
  adapter: guardedAdapter(plan.adapter, guard),
  messages,
  threadId: turn.threadId,
  runId: turn.runId,
  systemPrompts,
  tools,
  lazyToolsConfig: {includeDescription: 'first-sentence'},
  modelOptions: plan.modelOptions,
  abortController: controller,
  debug,
  middleware: [
    steer,
    withPersistence(persistence, {snapshotStreaming: true}),
    withLocks(locks),
    threadView,
    childCards(config.codeModeResult),
    withSandbox(sandbox, {
      runs: stores.runs,
      locks,
      durability: {adapter: durability, journal: config.sandbox.journalDir, detachOnDisconnect: true},
    }),
    concivTurn(turn, plan, granted, view, entry),
  ],
})
```

The middleware is generic `@tanstack/ai` middleware that applies to every adapter equally; none of it
has a per-harness variant. `withSandbox` is the published one from `@tanstack/ai-sandbox`, and conciv
hands it a sandbox built once at engine start — `localProcessSandbox({dir})` behind a `default: 'ask'`
policy, reused per thread (`packages/ai/src/server/chat-server.ts:234-247`) — together with the
durability options that make a run recoverable: the same event-log adapter the transport replays from,
a journal directory under the conciv state dir, and `detachOnDisconnect: true`, which leaves the agent
running when a client disconnects instead of destroying its sandbox. Tools that need approval are
wrapped by `gatedTools` (`packages/ai/src/server/chat-server.ts:162-176`). An adapter neither sees nor
makes those decisions, and `chatConfig` receives no approval callback: a CLI's own commands are governed
by that CLI's native permission mode (`permissionMode: 'auto'` for Claude Code), set in `chatConfig`. Conciv
keeps no command rules, so never add an "is this command risky" check to core or the widget.

## Sandbox-virtual workdir: `chatConfig` never passes a host `cwd`; `tty.command()` legitimately does

`localProcessSandbox({dir})` (`packages/ai/src/server/chat-server.ts:234-247`, `dir` is the engine cwd) roots every process
spawned **through the sandbox** at `deps.cwd` already — the sandbox root IS `deps.cwd`, not a
subdirectory of it (AGENTS.md, "Harness & runner
adapters": "the local-process sandbox root IS the cwd... adapters default to `/workspace`"). Because of
that, `chatConfig(deps)`'s adapter must **not** thread `deps.cwd` back in as an explicit `cwd`/`--cwd`
value for the process it spawns through the sandbox: a CLI that defaults its own working directory to
a fixed sandbox-relative path like `/workspace` is already handled correctly by the sandbox once it's
rooted there — passing `deps.cwd` (a host-absolute path) as an extra `cwd` argument on top of that gets
resolved _again_, relative to the sandbox root, and that's what nests a junk
`/workspace/Users/you/project/...` tree. Codex's `chatConfig` passes **no** `cwd` at all
(`packages/harness/src/codex/index.ts:11-19`) — that omission is correct, not a bug to fix.

`deps.cwd` is still a legitimate value inside `chatConfig` for anything that isn't the process's
working directory: claude's chat config threads it through as `addDirs: [deps.cwd]`
(`packages/harness/src/claude/chat.ts:73`), an additional-directory permission grant for MCP/tool file
access, not a `cwd` override.

`tty.command(ctx)` is a different seam: it builds the argv for the CLI in the built-in terminal pane,
which runs the raw CLI directly, outside `chat()`'s sandbox middleware entirely. There, `ctx.cwd`
(`HarnessConnectContext` in `packages/protocol/src/harness-types.ts`) is the ordinary, correct thing to
pass straight through, and claude's slash-command probe passes `cwd: ctx.cwd` straight into
`@anthropic-ai/claude-agent-sdk`'s `query()` (`packages/harness/src/claude/sdk.ts`), which also runs
outside the sandbox. Don't copy that `ctx.cwd` habit into `chatConfig`: they're different processes
with different rooting rules.

## Sidecars

- **`models?: HarnessModels`** — either a plain `HarnessModel[]` or a `() => HarnessModel[] |
  Promise<HarnessModel[]>` for CLIs whose model list must be fetched
  (`packages/protocol/src/harness-types.ts:24-33`). Read it through
  `resolveHarnessModels(adapter)` (`packages/harness/src/registry.ts:25-29`), never by branching on
  `typeof adapter.models` yourself elsewhere.
- **`tty?: {command(ctx: HarnessConnectContext): TtyCommand}`** — the argv/options for opening the CLI
  in the built-in terminal pane.
- There is no connect/launch-plan sidecar. Outside sessions of a harness (any cwd) reach conciv through the
  `conciv-hub` MCP server, `conciv mcp serve --agent <harness>` from `@conciv/cli` (`packages/cli/src/hub.ts`),
  which the user installs from the composer's "Connect agents" menu, `conciv mcp connect <harness>` or
  `conciv init`. That install argv lives on the harness's init contribution in `@conciv/harness-init` as
  `hub: {name, shellEnv, add(command, env): string[], remove?: string[]}` (`packages/harness-init/src/codex.ts`),
  not on the `HarnessAdapter`; `shellEnv` is the variable the CLI sets in its shell tool's env, so `conciv tools`
  run from that agent names it. A harness with no MCP support (pi) omits `hub`.
- **`commands?: HarnessCommands`** — `(ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>`
  (`packages/protocol/src/harness-types.ts:35-39`), required whenever `slashCommands !== 'none'`. Each
  `HarnessCommand` is `{name, description?, argumentHint?}`; `'live'` means query the running CLI for
  its commands, `'files'` means read them off disk.

## HarnessHistory: reading the CLI's own transcript

Required whenever `capabilities.transcriptHistory: true`. The contract
(`packages/protocol/src/harness-types.ts:151-166`) has three required methods, several optional
refinements, and one all-or-nothing pair:

```ts
export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId): Promise<ChatMessage[]>
  observe(cwd: string, sessionId: HarnessSessionId): TranscriptHandle
  withinProject?(cwd: string, sessionId: HarnessSessionId): boolean
  nameFromTranscript?(raw: string): string | null
  contextTokens?(raw: string): number | undefined
  list(cwd: string, page: HarnessListPage): Promise<HarnessSessionPage>
  meta(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionMeta | null>
  summary?(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionSummary | null>
}
```

`messages()`, `observe()`, and `list()` are the required minimum: parse the CLI's own on-disk
transcript into `ChatMessage[]`, return a live-tailing `TranscriptHandle` (`revision()/read()/close()`)
for streaming updates into an open chat pane, and enumerate past sessions for a cwd. `HarnessTranscriptPaths`
(`packages/protocol/src/harness-types.ts:143-149`) is a union, not two loose optionals: declare BOTH
`transcriptPath` and `transcriptRoot` or neither, because core resolves one against the other and
rejects a transcript that escapes the root (`transcriptPathWithin`,
`packages/harness/src/_shared/contained-path.ts:30-35`, reached for resume liveness by
`resumableToken` in `packages/chat/src/turn.ts:72-80`). Build `observe()` with the shared
`makeJsonlHandle()` helper if your CLI's transcript is JSONL-per-line (both `claude`
and `codex` do this: `packages/harness/src/codex/history.ts:347-360`). See
[transcript-history](references/transcript-history.md) for the full worked walkthrough (event folding, `verifyHead`
project-scoping, incremental byte-offset reads) — it's the densest part of a real adapter and doesn't
fit in this file's budget.

## Red flags — stop and reconsider

- Spawning the CLI with `node:child_process` from inside `chatConfig`'s adapter or a custom `stream`
  function, instead of declaring the command and letting the published adapter under `withSandbox`
  launch it — a self-spawned process bypasses abort handling and the sandbox's filesystem scoping.
- Any `if (harnessId === 'your-cli')` branch inside `packages/core` or the widget — the whole point of
  the capability contract is that core never special-cases a harness by name.
- Threading `deps.cwd` into `chatConfig`'s adapter as an explicit `cwd`/`--cwd` value — the sandbox
  already roots the spawned process there; an explicit host-absolute value on top of that is what
  nests the phantom `/workspace/Users/...` tree, not omitting it. (`tty.command()`'s `ctx.cwd` is a
  different, unsandboxed seam where passing it through is correct — see above.)
- Declaring `transcriptHistory: true`, `slashCommands: 'live' | 'files'`, or `init: 'files'` without
  the matching `history`/`commands`/`init` field — this is a type error, not a runtime bug, but if you
  see yourself reaching for `as HarnessAdapter` to silence it, the capability declaration is wrong,
  not the cast.
- A capability flag set to unlock a sidecar you haven't actually implemented (e.g. `mcp: 'http'` when
  `chatConfig` never wires the conciv MCP server in) — core will attempt the capability and get
  nothing back.
- Hand-rolling env var filtering instead of `definedEntries` from
  `packages/harness/src/_shared/env.ts`.

## Sources

- `packages/protocol/src/harness-types.ts`
- `packages/harness/src/_shared/contract.ts`
- `packages/harness/src/registry.ts`
- `packages/harness/src/codex/index.ts`
- `packages/harness-init/src/codex.ts`
- `packages/cli/src/hub.ts`
- `packages/harness/src/codex/history.ts`
- `packages/harness/src/claude/index.ts`
- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/claude/sdk.ts`
- `packages/harness/src/pi/index.ts`
- `packages/ai/src/adapters/adapters.ts`
- `packages/harness/src/_shared/text-adapter.ts`
- `packages/harness/src/_shared/env.ts`
- `packages/harness/src/_shared/acp.ts`
- `packages/harness/src/_shared/jsonl-handle.ts`
- `packages/harness/src/_shared/contained-path.ts`
- `packages/ai/src/server/chat-server.ts`
- `packages/chat/src/turn.ts`
- `apps/site/content/docs/harnesses.mdx`
- `AGENTS.md`
