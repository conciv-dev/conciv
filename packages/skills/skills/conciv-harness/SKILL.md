---
name: conciv-harness
description: Use when wiring a new coding-agent CLI into conciv as a harness adapter — implementing HarnessAdapter/defineHarness, HarnessCapabilities, connect.plan() launch args, chatConfig() text-adapter wiring, or the models/history/connect/tty/commands sidecars. Also use when a harness turn misbehaves around cwd, resume, or transcript history.
metadata:
  package: '@conciv/skills'
---

# Building a conciv harness adapter

## Overview

A harness adapter is a plain object that tells conciv how to talk to one coding-agent CLI: what
capabilities it has, how to launch it, and how to turn its output into `@tanstack/ai` stream chunks.
`HarnessAdapter` (`packages/protocol/src/harness-types.ts`) is capability-typed: the `capabilities`
field you declare determines, at compile time, which sidecar fields become required. Get a capability
flag wrong and TypeScript rejects the adapter, not a runtime check.

The one documented failure mode this skill exists to prevent: an adapter that spawns or decodes the
CLI itself, or special-cases the harness id in core/widget code, instead of returning a
`@tanstack/ai-*` text adapter from `chatConfig()` and letting `chat()` (with the conciv sandbox +
permission-gate middleware) own the process lifecycle. Every existing adapter (`claude`, `codex`) goes
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
  connect: {plan: yourConnectPlan},
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

(`packages/protocol/src/harness-types.ts:5-19`.) Three of these flags are load-bearing for the type
checker — `HarnessAdapter` is an intersection of three conditional pairs
(`packages/protocol/src/harness-types.ts:191-203`):

- `capabilities.transcriptHistory: true` ⇒ `history: HarnessHistory` is REQUIRED. `false` ⇒ `history`
  must be `undefined` (omit the field entirely).
- `capabilities.slashCommands: 'live' | 'files'` ⇒ `commands: HarnessCommands` is REQUIRED. `'none'` ⇒
  omit `commands`.
- `capabilities.init: 'files'` ⇒ `init: HarnessInit` is REQUIRED. `'none'` ⇒ omit `init`.

There is no matching compile-time link for `resume`, `permissionGate`, `compaction`, `systemPrompt`,
`mcp`, or `imageInput` — those are read at runtime by `packages/core/src/chat/run.ts` (e.g.
`deps.harness.capabilities.resume` gates whether a resume token is looked up,
`packages/core/src/chat/run.ts:173-174`; `deps.harness.capabilities.compaction` picks `/compact` vs a
fallback prompt, `packages/core/src/chat/run.ts:112-114`). Declare them honestly: `resume: false` when
your CLI has no session-resume flag, `mcp: 'none'` when it can't accept an MCP server URL, and so on —
core branches on these values to decide what to even attempt.

If your CLI genuinely has none of resume/history/commands/init, the minimal legal capabilities are
`{resume: false, permissionGate: 'none', transcriptHistory: false, compaction: false, systemPrompt:
'none', mcp: 'none', slashCommands: 'none', imageInput: false, init: 'none'}` and the adapter needs
only `chatConfig` (+ optionally `connect`).

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
  decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
}

export type HarnessChatConfig = {
  adapter: AnyTextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
}
```

(`packages/protocol/src/harness-types.ts:99-114`.) `chatConfig` is a plain function, `deps =>
HarnessChatConfig` — no async, no side effects at call time. Its `adapter` is a published
`@tanstack/ai-*` text adapter for CLIs that have one (`codexText` from `@tanstack/ai-codex`); if none
exists for your CLI, build one with `makeTextAdapter(name, stream)` from
`packages/harness/src/_shared/text-adapter.ts:45-47`, where `stream` is your own
`AsyncIterable<StreamChunk>` producer. Prefer **declaring** the launch command and letting the adapter
run it, the way `acpChatConfig` hands `acpCompatible` a `command` string plus a permission handler
built from `deps.decide` (`packages/harness/src/_shared/acp.ts:15-24`): everything launched that way
runs under `withSandbox`'s lifecycle. Reaching for `node:child_process` inside your `stream` steps
outside the sandbox and its abort handling (see the sandbox-virtual workdir section below).

Canonical call site — codex, which needs no message prep:

```ts
const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexText(deps.model ?? 'gpt-5.5', {
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
(`packages/harness/src/claude/chat.ts:72-85`). Only add it if your CLI needs message-shape
translation; most adapters omit it.

## `chat()` owns the turn — you never spawn or decode the CLI in core/widget

`packages/core/src/chat/run.ts:177-215` is the only call site that invokes `chatConfig` and hands the
result to `chat()`:

```ts
const config = deps.harness.chatConfig({cwd: deps.cwd, sessionId, resumeSessionId, model, env, kind, hasTools, decide})
return chat({
  adapter: config.adapter,
  messages,
  systemPrompts: extras.systemPrompts,
  threadId: sessionId,
  runId: req.runId,
  tools: extras.tools,
  lazyToolsConfig: {includeDescription: 'first-sentence'},
  modelOptions: config.modelOptions,
  middleware: [
    withSandbox(deps.sandbox, {
      runs: deps.runs,
      durability: {
        adapter: deps.durability(req.runId),
        journal: runJournalDir(deps.stateRoot),
        detachOnDisconnect: true,
      },
    }),
    withConcivGate(gate),
  ],
  abortController: abort,
  debug: harnessDebug,
})
```

Both middleware are generic `@tanstack/ai` middleware that apply to every adapter equally; neither has
a per-harness variant. `withSandbox` is the published one from `@tanstack/ai-sandbox`, and conciv hands
it a `SandboxDefinition` built once at engine start — `localProcessSandbox({dir: opts.cwd})` behind a
`default: 'ask'` policy, reused per thread (`packages/core/src/app.ts:449-455`) — together with the
durability options that make a run recoverable: the same event-log adapter the transport replays from,
a journal directory under the conciv state dir, and `detachOnDisconnect: true`, which leaves the agent
running when a client disconnects instead of destroying its sandbox. `withConcivGate`
(`packages/core/src/chat/gate.ts:276-284`) publishes a tool-bridge provisioner that wraps every bridged
tool in `gate.decide(...)` before it executes (`gateProvisioner`,
`packages/core/src/chat/gate.ts:255-274`). The `decide` callback your `chatConfig` receives is that
same gate narrowed to `'allow' | 'deny'` (`packages/core/src/chat/run.ts:185-186`). If your adapter
needs a CLI-specific "is this command risky" check, that's a sign the check belongs in `deps.decide`
(via `permissionGate: 'callback'`), not a special case bolted onto core or the widget.

## Sandbox-virtual workdir: `chatConfig` never passes a host `cwd`; `connect.plan()` legitimately does

`localProcessSandbox({dir: opts.cwd})` (`packages/core/src/app.ts:449-455`) roots every process
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
(`packages/harness/src/claude/chat.ts:75`), an additional-directory permission grant for MCP/tool file
access, not a `cwd` override.

`connect.plan(ctx)` is a different seam — it builds the argv for the connected **host terminal**
(attach flow), which runs the raw CLI directly, outside `chat()`'s sandbox middleware entirely. There,
`ctx.cwd` is the ordinary, correct thing to pass straight through: pi's connect plan builds a
session-file path from it (`packages/harness/src/pi/index.ts:6-9`, used at
`packages/harness/src/pi/index.ts:30`), and claude's slash-command probe passes `cwd: ctx.cwd` straight
into `@anthropic-ai/claude-agent-sdk`'s `query()` (`packages/harness/src/claude/sdk.ts:42`), which also
runs outside the sandbox. Don't copy `connect.plan()`'s `ctx.cwd` habit into `chatConfig` — they're
different processes with different rooting rules.

## connect.plan(): the argv/env/files launch plan

```ts
export type HarnessConnectContext = {
  cwd: string
  stateDir: string
  concivSessionId: SessionId
  harnessSessionId: HarnessSessionId | null
  resume: boolean
  owned: boolean
  model: string | null
  mcpUrl: string | null
  hookUrl: string | null
}

export type HarnessConnectPlan = {argv: string[]; env: Record<string, string>; files: HarnessConnectFile[]}
export type HarnessConnect = {plan(ctx: HarnessConnectContext): HarnessConnectPlan}
```

(`packages/protocol/src/harness-types.ts:42-62`.) `connect` is optional on `HarnessAdapterBase`
(`packages/protocol/src/harness-types.ts:182`) but every full adapter has one — it's how the connected
terminal / attach flow launches the raw CLI process (as opposed to `chatConfig`, which drives the
programmatic chat loop). `plan()` is synchronous and pure: given the context, return the argv, any env
vars, and any files that must exist before spawn (`files` entries are `{path, contents, mode?}`).

```ts
connect: {
  plan: (ctx) => ({
    argv: [
      'codex',
      ...(ctx.resume && ctx.harnessSessionId ? ['resume', ctx.harnessSessionId] : []),
      ...(ctx.model ? ['-m', ctx.model] : []),
      ...(ctx.mcpUrl ? codexMcpArgs(ctx.mcpUrl, ctx.concivSessionId) : []),
    ],
    env: {},
    files: [],
  }),
}
```

(`packages/harness/src/codex/index.ts:40-51`, MCP args built by `codexMcpArgs` in
`packages/harness/src/codex/args.ts:7-10`.) `ctx.mcpUrl`/`ctx.hookUrl` are only present when the
harness advertised `mcp !== 'none'`; branch on them rather than assuming they're always set.

## Sidecars

- **`models?: HarnessModels`** — either a plain `HarnessModel[]` or a `() => HarnessModel[] |
Promise<HarnessModel[]>` for CLIs whose model list must be fetched
  (`packages/protocol/src/harness-types.ts:25-34`). Read it through
  `resolveHarnessModels(adapter)` (`packages/harness/src/registry.ts:25-29`), never by branching on
  `typeof adapter.models` yourself elsewhere.
- **`tty?: {command(ctx: HarnessConnectContext): TtyCommand}`** — the argv/options for opening the CLI
  in the built-in terminal pane, separate from `connect.plan()`'s attach flow.
- **`commands?: HarnessCommands`** — `(ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>`
  (`packages/protocol/src/harness-types.ts:36-40`), required whenever `slashCommands !== 'none'`. Each
  `HarnessCommand` is `{name, description?, argumentHint?}`; `'live'` means query the running CLI for
  its commands, `'files'` means read them off disk.

## HarnessHistory: reading the CLI's own transcript

Required whenever `capabilities.transcriptHistory: true`. The contract
(`packages/protocol/src/harness-types.ts:159-174`) has three required methods, several optional
refinements, and one all-or-nothing pair:

```ts
export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<UIMessage[]>
  observe(cwd: string, sessionId: HarnessSessionId, home?: string): TranscriptHandle
  withinProject?(cwd: string, sessionId: HarnessSessionId, home?: string): boolean
  nameFromTranscript?(raw: string): string | null
  contextTokens?(raw: string): number | undefined
  list(cwd: string, home?: string): Promise<HarnessSessionMeta[]>
  meta?(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<HarnessSessionMeta | null>
  summary?(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<HarnessSessionSummary | null>
}
```

`messages()`, `observe()`, and `list()` are the required minimum: parse the CLI's own on-disk
transcript into `UIMessage[]`, return a live-tailing `TranscriptHandle` (`revision()/read()/close()`)
for streaming updates into an open chat pane, and enumerate past sessions for a cwd. `HarnessTranscriptPaths`
(`packages/protocol/src/harness-types.ts:151-157`) is a union, not two loose optionals: declare BOTH
`transcriptPath` and `transcriptRoot` or neither, because core resolves one against the other and
rejects a transcript that escapes the root (`transcriptPathWithin`,
`packages/harness/src/_shared/contained-path.ts:30-40`, reached for resume liveness by
`resumableToken` in `packages/core/src/chat/run.ts:51-64`). Build `observe()` with the shared
`makeJsonlHandle()` helper if your CLI's transcript is JSONL-per-line (both `claude`
and `codex` do this: `packages/harness/src/codex/history.ts:347-360`). See
`references/transcript-history.md` for the full worked walkthrough (event folding, `verifyHead`
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
  nests the phantom `/workspace/Users/...` tree, not omitting it. (`connect.plan()`'s `ctx.cwd` is a
  different, unsandboxed seam where passing it through is correct — see above.)
- Declaring `transcriptHistory: true`, `slashCommands: 'live' | 'files'`, or `init: 'files'` without
  the matching `history`/`commands`/`init` field — this is a type error, not a runtime bug, but if you
  see yourself reaching for `as HarnessAdapter` to silence it, the capability declaration is wrong,
  not the cast.
- A capability flag set to unlock a sidecar you haven't actually implemented (e.g. `mcp: 'http'` when
  `connect.plan()` never threads `ctx.mcpUrl` through) — core will attempt the capability and get
  nothing back.
- Hand-rolling env var filtering instead of `definedEntries` from
  `packages/harness/src/_shared/env.ts`.

## Sources

- `packages/protocol/src/harness-types.ts`
- `packages/harness/src/registry.ts`
- `packages/harness/src/codex/index.ts`
- `packages/harness/src/codex/args.ts`
- `packages/harness/src/codex/history.ts`
- `packages/harness/src/claude/index.ts`
- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/claude/sdk.ts`
- `packages/harness/src/pi/index.ts`
- `packages/harness/src/_shared/text-adapter.ts`
- `packages/harness/src/_shared/env.ts`
- `packages/harness/src/_shared/acp.ts`
- `packages/harness/src/_shared/jsonl-handle.ts`
- `packages/harness/src/_shared/contained-path.ts`
- `packages/core/src/chat/run.ts`
- `packages/core/src/app.ts`
- `packages/core/src/chat/gate.ts`
- `apps/site/content/docs/harnesses.mdx`
- `AGENTS.md`
