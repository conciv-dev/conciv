---
name: conciv-harness
description: Use when wiring a new coding-agent CLI into conciv as a harness adapter in @conciv/harness, implementing HarnessAdapter/defineHarness, HarnessCapabilities, chatConfig() text-adapter wiring, or the models/history/resume/login/tty/commands sidecars. Also use when a harness turn misbehaves around cwd, resume, or transcript history.
metadata:
  package: '@conciv/skills'
---

# Building a conciv harness adapter

## Overview

A harness adapter is a plain object that tells conciv how to talk to one coding-agent CLI: what
capabilities it has, how to launch it, and how to turn its output into `@tanstack/ai` stream chunks.
`HarnessAdapter` (`packages/harness/src/_shared/contract.ts:36-52`) is capability-typed: the
`capabilities` field you declare decides, at compile time, which sidecar fields are required. Get a
capability flag wrong and TypeScript rejects the adapter, not a runtime check.

The failure this skill exists to prevent: an adapter that spawns or decodes the CLI itself, or
special-cases the harness id in the engine or widget, instead of returning a text adapter from
`chatConfig()` and letting `chat()` (with the conciv sandbox) own the process. Every adapter goes
through that one seam. One that bypasses it duplicates process management, loses abort handling and
loses the sandbox's `dir`-scoped filesystem.

## The shape

The codex adapter, `defineHarness` in `packages/harness/src/codex/codex.ts:89-113`:

```ts
export function codex(provider: ConfigProvider.ConfigProvider) {
  const home = codexHome({CODEX_HOME: readOptionalConfig(provider, 'CODEX_HOME')})
  return defineHarness({
    id: 'codex',
    binName: 'codex',
    displayName: 'Codex',
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
      login: 'probe',
    },
    chatConfig: codexChatConfig,
    login: codexLogin(home, readOptionalConfig(provider, 'PATH')),
    models: () => codexModels(home),
    defaultModel: () => codexDefaultModel(home),
    history: codexHistory(home),
    resume: {command: ({nativeId}) => ({bin: 'codex', args: ['resume', nativeId]})},
  })
}
```

Register it in the adapter list of `harnessRegistry(provider)` (`packages/harness/src/registry.ts:23-29`),
add its init contribution to `packages/harness/src/init/registry.ts`, and add its entry to
`apps/site/content/docs/harnesses.mdx`.

## HarnessCapabilities: flags that gate the type, not just behavior

From `packages/types/src/harness-types.ts:13-29`:

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

  login: 'probe' | 'none'
}
```

Four flags are load-bearing for the type checker. `HarnessAdapter` is an intersection of four
conditional pairs (`packages/harness/src/_shared/contract.ts:36-52`):

- `transcriptHistory: true` ⇒ `history: HarnessHistory` and `resume: HarnessResume` are REQUIRED.
  `false` ⇒ omit both.
- `slashCommands: 'live' | 'files'` ⇒ `commands: HarnessCommands` is REQUIRED. `'none'` ⇒ omit it.
- `init: 'files'` ⇒ `init: HarnessInit` is REQUIRED. `'none'` ⇒ omit it.
- `login: 'probe'` ⇒ `login: HarnessLogin` is REQUIRED. `'none'` ⇒ omit it.

The other flags are read at run time by the turn code in `@conciv/backend-defaults`:
`harness.capabilities.resume` gates whether a resume token is used (`resumableToken`,
`packages/backend-defaults/src/turn.ts:120-150`), `harness.capabilities.compaction` picks `/compact`
or a fallback prompt (`packages/backend-defaults/src/turn.ts:200`), and
`harness.capabilities.systemPrompt` decides how the prompt is built
(`packages/backend-defaults/src/turn.ts:308`). Declare them honestly: `resume: false` when the CLI has
no session-resume flag, `mcp: 'none'` when it cannot take an MCP server, and so on. The engine
branches on these values to decide what to attempt.

## chatConfig(deps): the one required function

`HarnessChatDeps` is in `packages/types/src/harness-types.ts:120-129`, and `HarnessChatConfig` in
`packages/harness/src/_shared/contract.ts:16-20`:

```ts
export type HarnessChatDeps = {
  cwd: string
  sessionId: SessionId
  askPermission: (ask: HarnessPermissionAsk) => Promise<HarnessPermissionVerdict>
  resumeSessionId: HarnessSessionId | null
  model?: string
  effort?: ReasoningEffort
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact'
}
```

```ts
export type HarnessChatConfig = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => Promise<ModelMessage[]>
}
```

`chatConfig` is async, `deps => Promise<HarnessChatConfig>`. It may read files (codex reads its
default model from its config), but starts no process when it is called. Its `adapter` comes from a
factory in `packages/harness/src/adapters/adapters.ts` (`claudeCode`, `codex`, `opencode`, `acp`: thin
typed wrappers over the published `@tanstack/ai-*` adapters). When none fits your CLI, build one with
`makeTextAdapter(name, stream)` from the same file (`packages/harness/src/adapters/adapters.ts:37`),
where `stream` is your own `AsyncIterable<ChatEvent>` producer. Adapter code imports these factories,
not `@tanstack/ai-*` directly.

Prefer **declaring** the launch command and letting the adapter run it, the way `acpChatConfig` hands
`acp` a `command` builder and an `onPermissionRequest` callback
(`packages/harness/src/gemini-cli/gemini-cli.ts:53-62`): everything launched that way runs under
`withSandbox`'s lifecycle. Reaching for `node:child_process` inside your `stream` steps outside the
sandbox and its abort handling.

Codex, which needs no message prep, from `packages/harness/src/codex/codex.ts:23-30` and
`packages/harness/src/codex/codex.ts:56-59`:

```ts
export function codexRunAdapter(deps: HarnessChatDeps, model: string, toolCount: number): TextAdapter {
  return codexAdapter(model, {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    config: {...(toolCount > 0 ? approveTanstackToolsConfig : {}), ...effortConfig(deps.effort)},
    env: definedEntries(deps.env),
  })
}
```

```ts
const codexChatConfig = async (deps: HarnessChatDeps): Promise<HarnessChatConfig> => ({
  adapter: codexTurnAdapter(deps, deps.model ?? (await codexDefaultModel(codexHome(deps.env)))),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})
```

The tools a turn offers can change between model steps, so `deps` carries no tool flag. A CLI that must
know whether tools ride a step reads that step's `options.tools` inside `chatStream`, the way codex
builds its run adapter per step and auto-approves its tanstack MCP server only when that step offers
tools (`codexTurnAdapter`, `packages/harness/src/codex/codex.ts:46-54`).

`deps.env` is `Record<string, string | undefined>` (shaped like `process.env`). Most `@tanstack/ai-*`
adapters want `Record<string, string>`, so pass it through `definedEntries`
(`packages/harness/src/_shared/env.ts:1-3`) to drop the `undefined` values instead of casting.

`prepareMessages` rewrites the turn before it reaches the adapter. Claude's chat config sends a literal
`/compact` for a compaction turn and swaps in image file references otherwise (`claudeChatConfig`,
`packages/harness/src/claude/chat.ts:131-132`). Add it only when your CLI needs the messages reshaped.

## `chat()` owns the turn

The turn code is the only caller of `chatConfig` (`packages/backend-defaults/src/turn.ts:322-331`). The
plan it returns reaches `chat()` in the chat server (`packages/backend-defaults/src/ai/chat-server.ts:879-890`):

```ts
const stream = chat({
  adapter: guardedAdapter(answeredAdapter(plan.adapter, config.ids), {
    ended: entry.ending.signal,
    stopped: controller.signal,
    startMs: config.startTimeoutMs,
    firstOutputMs: config.firstOutputTimeoutMs,
    closeMs: config.sandbox.groupExitTimeoutMs ?? GROUP_EXIT_TIMEOUT_MS,
    onNotStarted: () => failed(`the agent did not start within ${seconds(config.startTimeoutMs)}s`),
    onSilence: () => failed(`the agent produced no output within ${seconds(config.firstOutputTimeoutMs)}s`),
    stop: () => controller.abort(RUN_CANCEL_REASON),
    log: config.log,
  }),
```

Its middleware (`packages/backend-defaults/src/ai/chat-server.ts:901-936`) is generic `@tanstack/ai`
middleware that applies to every adapter alike; none of it has a per-harness variant. `withSandbox` is
the published one from `@tanstack/ai-sandbox`. The sandbox is defined once per chat server with
`localSandbox(config.sandbox)`, a `default: 'ask'` policy, and reuse per thread
(`defineSandbox`, `packages/backend-defaults/src/ai/chat-server.ts:590-596`). The CLI's output is read
straight from its pipe, so the chat server's two limits are the only bound on a silent CLI: a start
limit until the adapter's first `RUN_STARTED`, then a silence limit until its first output.

A plugin tool that asks does so itself through `ctx.permission.assert` and waits on the user's card. A
CLI's own commands are governed by that CLI's native permission mode (`permissionMode: 'auto'` for
Claude Code, `packages/harness/src/claude/chat.ts:130`), set in `chatConfig`. When the CLI itself decides
to ask, the ask goes to conciv's permission service and waits on the user's card: Claude Code through
its permission prompt tool, which conciv's tool bridge serves (`askingToolProvisioner`,
`packages/backend-defaults/src/ai/chat-server.ts:906-910`); an ACP CLI through `onPermissionRequest`,
which calls `deps.askPermission`. An ask ends with its run. Never add an "is this command risky" check
to the engine or the widget.

## Sandbox-virtual workdir: `chatConfig` never passes a host `cwd`; `tty.command()` does

`localSandbox({dir})` wraps `localProcessSandbox({dir})` (`packages/harness/src/local-sandbox.ts:12-19`),
with `dir` the engine's cwd, so every process spawned **through the sandbox** is already rooted at
`deps.cwd`: the sandbox root IS `deps.cwd` (AGENTS.md, "Harness & runner adapters": "the local-process
sandbox root IS the cwd and adapters default to `/workspace`"). So `chatConfig`'s adapter must **not**
pass `deps.cwd` back in as a `cwd`/`--cwd` value for the process it spawns through the sandbox: a
host-absolute path on top of the root is resolved again, relative to the sandbox root, and nests a junk
`/workspace/Users/you/project/...` tree. Codex's `chatConfig` passes no `cwd` at all
(`packages/harness/src/codex/codex.ts:23-30`), and that is correct.

`deps.cwd` is still fine for anything that is not the process's working directory: claude's chat
config passes it as `addDirs: [deps.cwd]` (`packages/harness/src/claude/chat.ts:117`), an extra
directory grant, not a `cwd` override.

`tty.command(ctx)` is a different seam: it builds the argv for the CLI in the built-in terminal pane,
which runs the raw CLI outside `chat()`'s sandbox. There `ctx.cwd` (`HarnessConnectContext`,
`packages/types/src/harness-types.ts:57-60`) is the right thing to pass through, and claude's
slash-command probe passes `cwd: ctx.cwd` into the Claude Agent SDK's `query()`
(`packages/harness/src/claude/sdk.ts:76`), also outside the sandbox. Don't copy that habit into
`chatConfig`.

## Sidecars

- **`models?: HarnessModels`**: a plain `HarnessModel[]`, or `({signal}) => HarnessModel[] |
  Promise<HarnessModel[]>` for a CLI whose model list must be fetched
  (`packages/types/src/harness-types.ts:47-49`). The engine aborts `signal` when it stops: hand it to
  whatever lists the models (`execFile(..., {signal})`, a `fetch`) so a listing still running ends with
  the engine. Read it through `resolveHarnessModels(adapter, {signal})`
  (`packages/harness/src/registry.ts:31-38`), never by branching on `typeof adapter.models` yourself.
- **`login?: HarnessLogin`** with `login: 'probe'`: `({signal, refresh}) => Promise<HarnessLoginStatus>`
  (`packages/types/src/harness-types.ts:31`). Read it through `resolveHarnessLogin`
  (`packages/harness/src/registry.ts:40-51`), which answers logged in when there is no probe or the
  probe throws.
- **`resume: HarnessResume`** (with `transcriptHistory: true`): `command({cwd, nativeId})` returns the
  `{bin, args}` that resumes a past session (`packages/types/src/harness-types.ts:143-145`).
- **`tty?: {command(ctx: HarnessConnectContext): TtyCommand}`**: the argv and options for opening the
  CLI in the built-in terminal pane.
- **`commands?: HarnessCommands`**: `(ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>`
  (`packages/types/src/harness-types.ts:51-55`), required whenever `slashCommands !== 'none'`. Each
  `HarnessCommand` is `{name, description?, argumentHint?}`.
- There is no connect sidecar on the adapter. Agent sessions outside the browser reach conciv through
  the `conciv-hub` MCP server (`conciv mcp serve --agent <harness>`, `packages/cli/src/hub.ts`), which
  the user installs from the composer's "Connect agents" menu, `conciv mcp connect <harness>` or
  `conciv init`. The install argv is the harness's init contribution's `hub: {name, shellEnv, add,
  remove?}` (`packages/types/src/harness-types.ts:87-92`; opencode's at
  `packages/harness/src/init/registry.ts:10-27`), not a field of `HarnessAdapter`. `shellEnv` is the
  variable the CLI sets in its shell tool's env, so `conciv tools` run from that agent names it. A
  harness with no MCP support (pi) has no `hub`.

## HarnessHistory: reading the CLI's own transcript

Required whenever `transcriptHistory: true`. From `packages/types/src/harness-types.ts:169-180`:

```ts
export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId, options?: {signal?: AbortSignal}): Promise<ChatMessage[]>
  tail(cwd: string, sessionId: HarnessSessionId, options: TranscriptTailOptions): Promise<TranscriptPage>

  withinProject?(cwd: string, sessionId: HarnessSessionId): Promise<boolean>

  contextTokens?(line: string): number | undefined

  list(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage>

  meta(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionMeta | null>
}
```

`messages()`, `tail()`, `list()` and `meta()` are the required minimum: parse the CLI's transcript
into `ChatMessage[]`, read one page back from the end (`{limit, before, signal}` to `{messages,
earlier}`, with an opaque cursor; build it on `tailLines` from `packages/harness/src/_shared/tail-lines.ts`
for a JSONL transcript, so a page costs its own size and its ids match `messages()`), and list past
sessions. `HarnessTranscriptPaths` (`packages/types/src/harness-types.ts:155-161`) is a union, not two
loose optionals: declare BOTH `transcriptPath` and `transcriptRoot` or neither, because the engine
resolves one against the other and refuses a transcript that escapes the root
(`transcriptPathWithin`, `packages/harness/src/_shared/contained-path.ts:29-38`, used for resume by
`resumableToken`, `packages/backend-defaults/src/turn.ts:146`). See
[transcript-history](references/transcript-history.md) for the worked walkthrough (event folding,
project scoping by the recorded cwd).

## Red flags: stop and reconsider

- Spawning the CLI with `node:child_process` from `chatConfig`'s adapter or a custom `stream`, instead of
  declaring the command and letting the published adapter under `withSandbox` launch it.
- Any `if (harnessId === 'your-cli')` branch in `@conciv/backend-defaults` or the widget: the capability
  contract exists so the engine never special-cases a harness by name.
- Passing `deps.cwd` into `chatConfig`'s adapter as a `cwd`/`--cwd` value: that nests the phantom
  `/workspace/Users/...` tree. (`tty.command()`'s `ctx.cwd` is the unsandboxed seam where passing it
  through is correct.)
- Declaring `transcriptHistory: true`, `slashCommands: 'live' | 'files'`, `init: 'files'` or
  `login: 'probe'` without the matching field: a type error. Reaching for `as HarnessAdapter` to
  silence it means the capability declaration is wrong.
- A capability flag set for something you have not built (`mcp: 'http'` when `chatConfig` never wires
  the conciv MCP server in): the engine attempts it and gets nothing back.
- Hand-rolled env filtering instead of `definedEntries` from `packages/harness/src/_shared/env.ts`.

## Sources

- `packages/types/src/harness-types.ts`
- `packages/harness/src/_shared/contract.ts`
- `packages/harness/src/registry.ts`
- `packages/harness/src/codex/codex.ts`
- `packages/harness/src/codex/history.ts`
- `packages/harness/src/init/registry.ts`
- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/claude/sdk.ts`
- `packages/harness/src/pi/pi.ts`
- `packages/harness/src/adapters/adapters.ts`
- `packages/harness/src/local-sandbox.ts`
- `packages/harness/src/_shared/env.ts`
- `packages/harness/src/_shared/tail-lines.ts`
- `packages/harness/src/_shared/contained-path.ts`
- `packages/harness/src/gemini-cli/gemini-cli.ts`
- `packages/backend-defaults/src/turn.ts`
- `packages/backend-defaults/src/ai/chat-server.ts`
- `packages/cli/src/hub.ts`
- `apps/site/content/docs/harnesses.mdx`
- `AGENTS.md`
