# Harness Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the inline claude harness (currently wired inside `@devgent/core` per Plan 1) into a dedicated `@devgent/harness` package behind the capability-declaring `HarnessAdapter` interface, add a real **codex** proof adapter, ship **gemini-cli / opencode / pi** as capability-only stubs, and make `@devgent/core` feature-detect by capability (degrade gracefully when `permissionGate`, `transcriptHistory`, `resume`, or file `systemPrompt` are absent).

**Architecture:** Adapter registry (`registerHarness` / `getHarness` / `listHarnesses`) over the `HarnessAdapter` contract from `@devgent/protocol/harness-types`. Each adapter is a subfolder of named files (`<id>.ts` declares the adapter + capabilities; `args.ts`/`decode.ts`/`history.ts`/`system-prompt.ts` hold the ported behaviour). Adapters depend only on `@devgent/protocol` and `@tanstack/ai` — never on the engine. `@devgent/core` resolves `getHarness(config.harness ?? 'claude')` and wires routes conditionally on the adapter's `capabilities`.

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`, `isolatedModules`), Node 22 (`node:` builtins, `Readable`), pnpm workspaces + turbo, tsdown (per-module entries, no barrels), vitest. `@tanstack/ai` for `StreamChunk` / `EventType`. Functions-not-classes, no IIFEs, no `index.ts`.

---

## Preconditions (assumes Plan 1 complete)

- `@devgent/protocol/harness-types` **exists** and exports `HarnessCapabilities`, `HarnessTurn`, `HarnessChild`, `HarnessAdapter` exactly as specified in the design's "Seam 1":

  ```ts
  // @devgent/protocol/harness-types (created by Plan 1)
  import type {Readable} from 'node:stream'
  import type {StreamChunk, UIMessage} from '@tanstack/ai'

  export type HarnessCapabilities = {
    resume: boolean
    permissionGate: 'hook' | 'none'
    transcriptHistory: boolean
    systemPrompt: 'file' | 'flag' | 'none'
  }

  export type HarnessTurn = {
    prompt: string
    cwd: string
    resumeSessionId: string | null
    systemPrompt: string
    permissionUrl?: string
  }

  export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; kill(): void}

  export type HarnessDecodeOpts = {onSessionId(id: string): void}

  export type HarnessAdapter = {
    id: string
    binName: string
    capabilities: HarnessCapabilities
    buildArgs(turn: HarnessTurn): string[]
    decode(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk>
    transcriptPath?(cwd: string, sessionId: string): string
    parseHistory?(raw: string): UIMessage[]
  }
  ```

- `@devgent/core` **exists** (h3 engine) and currently wires claude **inline** via a harness registry that lives inside core. The claude behaviour at this point is a verbatim move of the old `packages/vite-plugin/src/{claude-args,claude-agui-stream,transcript-path,history-parser,chat-system-prompt}.ts` files. Plan 1 left the chat route reading a resolved `HarnessAdapter` (so `buildArgs` / `decode` / `transcriptPath` / `parseHistory` are already the seam — the route no longer imports `buildChatClaudeArgs` / `claudeToAguiEvents` directly).
- `claude-lock.ts` already lives in `@devgent/core` (renamed `claude.lock` → `agent.lock`) and stays there — it is harness-agnostic and out of this plan's scope.
- The chat-route IT fixture exists at `@devgent/core`'s test tree as `fixtures/fake-claude.ts` (the real-executable stand-in moved from the vite-plugin).

> If any precondition is false, STOP and finish Plan 1 first.

---

## File Structure

```
packages/harness/
  package.json                exports "." -> dist/registry.js, "./claude","./codex","./gemini-cli","./opencode","./pi"
  tsdown.config.ts            per-module entries; @tanstack/ai + @devgent/protocol external
  tsconfig.json               extends ../../tsconfig.base.json
  src/
    registry.ts               registerHarness / getHarness(id) / listHarnesses (+ self-registers bundled adapters)
    claude/
      claude.ts               export const claude: HarnessAdapter   {resume,permissionGate:'hook',transcriptHistory,systemPrompt:'file'}
      args.ts                 buildArgs           (ported from claude-args.ts)
      decode.ts               decode              (ported from claude-agui-stream.ts)
      history.ts              transcriptPath + parseHistory   (ported from transcript-path.ts + history-parser.ts)
      system-prompt.ts        CHAT_SYSTEM_PROMPT  (ported from chat-system-prompt.ts)
    codex/
      codex.ts                export const codex: HarnessAdapter    {resume:?,permissionGate:'none',transcriptHistory:?,systemPrompt:'flag'}
      args.ts                 buildArgs (codex exec)
      decode.ts               decode (codex exec JSON event stream -> StreamChunk)
    gemini-cli/
      gemini-cli.ts           stub: capabilities only; buildArgs throws 'not implemented'
    opencode/
      opencode.ts             stub
    pi/
      pi.ts                   stub
  test/
    claude-args.test.ts
    claude-decode.test.ts
    claude-history.test.ts
    codex-args.test.ts
    codex-decode.test.ts
    registry.test.ts
    capability-matrix.test.ts
    fixtures/
      fake-harness.ts         generic real-executable harness stand-in (generalizes fake-claude.ts)
    harness.it.test.ts        IT: drive an adapter end-to-end via fake-harness; permissionGate:'none' skips the gate

packages/core/                (edited — feature-detection wiring)
  package.json                + dependency "@devgent/harness": "workspace:*"
  src/
    chat-route.ts             resolve getHarness; conditional /permission, /history, prepend-systemPrompt
    server.ts (or engine.ts)  resolve adapter once at boot; pass to chat route
```

**Conventions (enforced every task):** ESM, Node22, `verbatimModuleSyntax` (type-only imports use `import type`), functions-not-classes, no IIFEs (the ported claude code uses inline-IIFE `try/catch` helpers — convert them to named functions during the port), **no `index.ts`**. Commit straight to **`main`** (no branches). Every commit message ends with:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Task 1 — Scaffold `@devgent/harness` + register in the workspace

**Files:**

- `packages/harness/package.json` (new)
- `packages/harness/tsconfig.json` (new)
- `packages/harness/tsdown.config.ts` (new)
- `packages/harness/src/registry.ts` (new — minimal, expanded in Task 2)
- `packages/harness/test/registry.test.ts` (new)

Steps:

- [ ] Write the **failing test** `packages/harness/test/registry.test.ts`:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {defineHarness, type HarnessAdapter} from '@devgent/protocol/harness-types'
  import {registerHarness, getHarness, listHarnesses} from '../src/registry.js'

  // Even the registry's throwaway test adapter goes through defineHarness (Constraint A).
  function stub(id: string): HarnessAdapter {
    return defineHarness({
      id,
      binName: id,
      capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'none'},
      buildArgs: () => [],
      // eslint-disable-next-line require-yield
      async *decode() {},
    })
  }

  describe('harness registry', () => {
    it('registers and resolves an adapter by id', () => {
      registerHarness(stub('test-x'))
      expect(getHarness('test-x').id).toBe('test-x')
    })

    it('lists registered ids including the bundled adapters', () => {
      const ids = listHarnesses().map((a) => a.id)
      expect(ids).toContain('test-x')
      expect(ids).toContain('claude')
      expect(ids).toContain('codex')
    })

    it('throws a clear error for an unknown id', () => {
      expect(() => getHarness('nope')).toThrow(/unknown harness: nope/)
    })
  })
  ```

- [ ] **Run** (expect FAIL — package + module do not exist yet):

  ```
  pnpm --filter @devgent/harness test
  ```

  Expected: command errors with `No projects matched the filters "@devgent/harness"` (package not yet in the workspace). That counts as RED for this task — the package must exist before the test can even run.

- [ ] **Minimal impl** — create `packages/harness/package.json`:

  ```json
  {
    "name": "@devgent/harness",
    "version": "0.0.0",
    "description": "Harness adapters (claude, codex, + stubs) behind the @devgent/protocol HarnessAdapter contract.",
    "license": "MIT",
    "files": ["dist"],
    "type": "module",
    "exports": {
      ".": {
        "types": "./dist/registry.d.ts",
        "import": "./dist/registry.js"
      },
      "./claude": {
        "types": "./dist/claude/claude.d.ts",
        "import": "./dist/claude/claude.js"
      },
      "./codex": {
        "types": "./dist/codex/codex.d.ts",
        "import": "./dist/codex/codex.js"
      },
      "./gemini-cli": {
        "types": "./dist/gemini-cli/gemini-cli.d.ts",
        "import": "./dist/gemini-cli/gemini-cli.js"
      },
      "./opencode": {
        "types": "./dist/opencode/opencode.d.ts",
        "import": "./dist/opencode/opencode.js"
      },
      "./pi": {
        "types": "./dist/pi/pi.d.ts",
        "import": "./dist/pi/pi.js"
      }
    },
    "scripts": {
      "build": "tsdown",
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "lint": "oxlint",
      "test": "vitest run"
    },
    "dependencies": {
      "@devgent/protocol": "workspace:*",
      "@tanstack/ai": "^0.28.0"
    },
    "devDependencies": {
      "@types/node": "^22.19.21",
      "tsdown": "^0.22.2",
      "typescript": "^6.0.3",
      "vitest": "^4.1.8"
    }
  }
  ```

- [ ] Create `packages/harness/tsconfig.json`:

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "rootDir": ".",
      "noEmit": true,
      "lib": ["ES2023"],
      "types": ["node"]
    },
    "include": ["src/**/*.ts", "test/**/*.ts"]
  }
  ```

- [ ] Create `packages/harness/tsdown.config.ts` (each adapter is its own entry so the subpath exports resolve to named files; `@tanstack/ai` + `@devgent/protocol` stay external):

  ```ts
  import {defineConfig} from 'tsdown'

  // Per-module entries (no barrel). registry.ts is the package entry ("."); each adapter's
  // <id>.ts is a subpath export. @tanstack/ai + @devgent/protocol stay external.
  export default defineConfig({
    entry: [
      'src/registry.ts',
      'src/claude/claude.ts',
      'src/codex/codex.ts',
      'src/gemini-cli/gemini-cli.ts',
      'src/opencode/opencode.ts',
      'src/pi/pi.ts',
    ],
    format: 'esm',
    fixedExtension: false,
    dts: true,
  })
  ```

- [ ] Create `packages/harness/src/registry.ts` (registry + self-registration of bundled adapters; uses a module-level `Map`, functions-not-classes, no IIFE). The adapter imports are added as each adapter is built — start with `claude` + `codex` (Tasks 2-3) and the three stubs (Task placeholder; created in Task 7-ish but referenced here from the start so `listHarnesses` includes them). For Task 1 RED→GREEN, create the registry referencing only the bundled adapters that will exist; if an adapter file is not yet created, comment its import + register line and uncomment it in the task that creates it.

  ```ts
  import type {HarnessAdapter} from '@devgent/protocol/harness-types'
  import {claude} from './claude/claude.js'
  import {codex} from './codex/codex.js'
  import {geminiCli} from './gemini-cli/gemini-cli.js'
  import {opencode} from './opencode/opencode.js'
  import {pi} from './pi/pi.js'

  const registry = new Map<string, HarnessAdapter>()
  // NOTE: adapters are defined via defineHarness() in their own files (Constraint A) — the
  // registry just stores them. No bare object literals reach this map.

  export function registerHarness(adapter: HarnessAdapter): void {
    registry.set(adapter.id, adapter)
  }

  export function getHarness(id: string): HarnessAdapter {
    const found = registry.get(id)
    if (!found)
      throw new Error(
        `unknown harness: ${id} (known: ${listHarnesses()
          .map((a) => a.id)
          .join(', ')})`,
      )
    return found
  }

  export function listHarnesses(): HarnessAdapter[] {
    return [...registry.values()]
  }

  // Bundled adapters self-register on import of the package entry.
  for (const adapter of [claude, codex, geminiCli, opencode, pi]) registerHarness(adapter)
  ```

  > NOTE: This final form references all five adapters. To keep Task 1 self-contained and green, create thin placeholder adapter files now (each exporting a minimal `HarnessAdapter` matching the `stub()` shape) and flesh them out in their own tasks. Concretely, for Task 1 create `src/claude/claude.ts`, `src/codex/codex.ts`, `src/gemini-cli/gemini-cli.ts`, `src/opencode/opencode.ts`, `src/pi/pi.ts` each as a `defineHarness(...)` call (Constraint A — never a bare object literal, even for placeholders):

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'

  // PLACEHOLDER — fleshed out in its own task. Capabilities/behaviour are corrected there.
  // Wrapped in defineHarness so the contract is enforced + inferred from day one.
  export const claude = defineHarness({
    id: 'claude',
    binName: 'claude',
    capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'none'},
    buildArgs: () => [],
    // eslint-disable-next-line require-yield
    async *decode() {},
  })
  ```

  (substitute `codex`/`geminiCli`/`opencode`/`pi` + their ids accordingly). `defineHarness` (from Plan 1, `@devgent/protocol/harness-types`) returns its argument typed as the exact literal `T extends HarnessAdapter`, so each export stays assignable to `HarnessAdapter` in the registry. The placeholder declares `transcriptHistory: false` with no `transcriptPath`/`parseHistory`, satisfying `defineHarness`'s dev-time invariant. This makes the registry compile and `listHarnesses()` return all five immediately; later tasks replace each placeholder body.

- [ ] Confirm the workspace already globs `packages/*` (it does — `pnpm-workspace.yaml` has `packages/*`), then install so the new package is linked:

  ```
  pnpm install
  ```

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test
  ```

  Expected: 3 passed (registry resolves `test-x`, lists `claude`+`codex`, throws on unknown).

- [ ] **Run** the build + typecheck to confirm scaffolding is sound:

  ```
  pnpm --filter @devgent/harness build && pnpm --filter @devgent/harness typecheck
  ```

  Expected: clean.

- [ ] **Commit**:

  ```
  git add packages/harness pnpm-lock.yaml
  git commit -m "feat(harness): scaffold @devgent/harness package + registry

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2 — Port claude `buildArgs`

**Files:**

- `packages/harness/test/claude-args.test.ts` (new)
- `packages/harness/src/claude/args.ts` (new)
- `packages/harness/src/claude/claude.ts` (replace placeholder body — capabilities + wire `buildArgs`)

Steps:

- [ ] Write the **failing test** `packages/harness/test/claude-args.test.ts`. Asserts the ported argv shape, that the PreToolUse hook `--settings` is added **only** when `permissionUrl` is present (the route supplies it iff `capabilities.permissionGate==='hook'`), and that `--append-system-prompt-file` / `--resume` are conditional:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {buildArgs} from '../src/claude/args.js'
  import type {HarnessTurn} from '@devgent/protocol/harness-types'

  const base: HarnessTurn = {prompt: 'hello', cwd: '/repo', resumeSessionId: null, systemPrompt: ''}

  describe('claude buildArgs', () => {
    it('builds the headless stream-json argv with acceptEdits + allowed devgent tools + add-dir', () => {
      const args = buildArgs(base)
      expect(args.slice(0, 2)).toEqual(['-p', 'hello'])
      expect(args).toContain('--output-format')
      expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
      expect(args).toContain('--verbose')
      expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits')
      expect(args).toContain('Bash(devgent tools:*)')
      expect(args).toContain('Bash(devgent ui:*)')
      expect(args[args.indexOf('--add-dir') + 1]).toBe('/repo')
    })

    it('omits --settings, --append-system-prompt-file and --resume when not provided', () => {
      const args = buildArgs(base)
      expect(args).not.toContain('--settings')
      expect(args).not.toContain('--append-system-prompt-file')
      expect(args).not.toContain('--resume')
    })

    it('adds the PreToolUse Bash http hook via --settings only when permissionUrl is given', () => {
      const args = buildArgs({...base, permissionUrl: 'http://h/__pw/chat/permission'})
      const i = args.indexOf('--settings')
      expect(i).toBeGreaterThan(-1)
      // No casts: index returns `string | undefined`, JSON.parse returns `unknown`, then narrow
      // structurally via an isRecord guard before asserting on shape.
      const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
      const raw = args[i + 1]
      expect(typeof raw).toBe('string')
      const settings: unknown = JSON.parse(raw ?? '{}')
      function firstBashHook(s: unknown): Record<string, unknown> | undefined {
        if (!isRecord(s)) return undefined
        const hooks = s.hooks
        if (!isRecord(hooks)) return undefined
        const pre = hooks.PreToolUse
        return Array.isArray(pre) && isRecord(pre[0]) ? pre[0] : undefined
      }
      const hook = firstBashHook(settings)
      expect(hook?.matcher).toBe('Bash')
      expect(Array.isArray(hook?.hooks) ? hook?.hooks[0] : undefined).toEqual({
        type: 'http',
        url: 'http://h/__pw/chat/permission',
        timeout: 600,
      })
    })

    it('appends the system-prompt file and --resume when provided', () => {
      const args = buildArgs({
        ...base,
        systemPrompt: '/tmp/sys.txt',
        resumeSessionId: 'sess-1',
      })
      expect(args[args.indexOf('--append-system-prompt-file') + 1]).toBe('/tmp/sys.txt')
      expect(args[args.indexOf('--resume') + 1]).toBe('sess-1')
    })
  })
  ```

  > Mapping note: the old `ChatClaudeOptions.appendSystemPromptFile` becomes `HarnessTurn.systemPrompt`. For claude (`systemPrompt:'file'`) the route writes the prompt text to a temp file and passes the **path** as `turn.systemPrompt`; claude's `buildArgs` forwards it to `--append-system-prompt-file`. (The temp-file write is core's job, unchanged from Plan 1 — `buildArgs` just consumes the path.)

- [ ] **Run** (expect FAIL — `args.ts` exports nothing yet):

  ```
  pnpm --filter @devgent/harness test claude-args
  ```

  Expected: FAIL — `buildArgs is not a function` / module `../src/claude/args.js` not found.

- [ ] **Minimal impl** — create `packages/harness/src/claude/args.ts` (ported verbatim from `claude-args.ts`, retyped onto `HarnessTurn`; `appendSystemPromptFile` → `systemPrompt`):

  ```ts
  import type {HarnessTurn} from '@devgent/protocol/harness-types'

  // The PreToolUse hook settings injected via --settings: an http hook on Bash that defers the
  // decision to the engine's /__pw/chat/permission route. 600s timeout (the route auto-denies
  // sooner) so a real user approval has time to land. Wired only when the route supplies a
  // permissionUrl — i.e. only for permissionGate:'hook' harnesses.
  function hookSettings(permissionUrl: string): string {
    return JSON.stringify({
      hooks: {
        PreToolUse: [{matcher: 'Bash', hooks: [{type: 'http', url: permissionUrl, timeout: 600}]}],
      },
    })
  }

  // Build the headless `claude -p` argv for a chat turn: streaming JSON, auto-accept edits
  // (git is the undo net), and the working tree as an allowed dir. --resume continues a prior
  // session when one is supplied. The agent's own `devgent tools`/`devgent ui` CLIs are
  // pre-allowed; every other Bash still gates through the PreToolUse hook.
  export function buildArgs(turn: HarnessTurn): string[] {
    const args = [
      '-p',
      turn.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Bash(devgent tools:*)',
      'Bash(devgent ui:*)',
      '--add-dir',
      turn.cwd,
    ]
    if (turn.permissionUrl) args.push('--settings', hookSettings(turn.permissionUrl))
    if (turn.systemPrompt) args.push('--append-system-prompt-file', turn.systemPrompt)
    if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId)
    return args
  }
  ```

- [ ] Update `packages/harness/src/claude/claude.ts` to the **real** capabilities + wire `buildArgs` (leave `decode` / `transcriptPath` / `parseHistory` as placeholders until Tasks 3-4):

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'
  import {buildArgs} from './args.js'

  export const claude = defineHarness({
    id: 'claude',
    binName: 'claude',
    // transcriptHistory stays false until Task 4 wires transcriptPath + parseHistory — see note.
    capabilities: {resume: true, permissionGate: 'hook', transcriptHistory: false, systemPrompt: 'file'},
    buildArgs,
    // decode / transcriptPath / parseHistory wired in Tasks 3-4.
    // eslint-disable-next-line require-yield
    async *decode() {},
  })
  ```

  > Constraint A: claude is defined through `defineHarness`, never a bare literal. NOTE: `transcriptHistory` is held at `false` here on purpose. `defineHarness` runs its dev-time invariant (`transcriptHistory ⇒ transcriptPath && parseHistory`) at module-load; declaring `true` before the history methods exist would THROW on import and break this task's test. Flip `transcriptHistory` to `true` in Task 4's final form — the same step that adds `transcriptPath`/`parseHistory` — so the capability and its methods land together. (The design's invariant is exactly what forces them to land together.)

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test claude-args
  ```

  Expected: 4 passed.

- [ ] **Commit**:

  ```
  git add packages/harness/src/claude packages/harness/test/claude-args.test.ts
  git commit -m "feat(harness): port claude buildArgs onto HarnessTurn

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3 — Port claude `decode` (stream-json → StreamChunk)

**Files:**

- `packages/harness/test/claude-decode.test.ts` (new)
- `packages/harness/src/claude/decode.ts` (new)
- `packages/harness/src/claude/claude.ts` (wire `decode`)

Steps:

- [ ] Write the **failing test** `packages/harness/test/claude-decode.test.ts`. Feeds sample claude `stream-json` NDJSON lines through `decode` and asserts the AG-UI `StreamChunk` sequence + that `onSessionId` fires:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import {decode} from '../src/claude/decode.js'

  async function* lines(arr: string[]): AsyncGenerator<string> {
    for (const l of arr) yield l
  }

  async function collect(input: string[], onSessionId = (_: string) => {}): Promise<StreamChunk[]> {
    const out: StreamChunk[] = []
    for await (const c of decode(lines(input), {onSessionId})) out.push(c)
    return out
  }

  // Cast-free field readers: every StreamChunk is a record, so read optional fields through an
  // isRecord guard + typeof checks instead of asserting the chunk's shape with `as`.
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
  function strField(chunk: StreamChunk | undefined, key: string): string | undefined {
    if (!isRecord(chunk)) return undefined
    const v = chunk[key]
    return typeof v === 'string' ? v : undefined
  }

  describe('claude decode', () => {
    it('wraps a text assistant block in RUN_STARTED .. TEXT_MESSAGE_* .. RUN_FINISHED', async () => {
      const got = await collect([
        JSON.stringify({type: 'system', subtype: 'init', session_id: 'sess-1'}),
        JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'hi there'}]}}),
        JSON.stringify({type: 'result', session_id: 'sess-1'}),
      ])
      const types = got.map((c) => c.type)
      expect(types[0]).toBe(EventType.RUN_STARTED)
      expect(types.at(-1)).toBe(EventType.RUN_FINISHED)
      expect(types).toContain(EventType.TEXT_MESSAGE_START)
      expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT)
      expect(types).toContain(EventType.TEXT_MESSAGE_END)
      const content = got.find((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
      expect(strField(content, 'delta')).toBe('hi there')
    })

    it('emits THINKING/REASONING events for a thinking block', async () => {
      const got = await collect([
        JSON.stringify({type: 'assistant', message: {content: [{type: 'thinking', thinking: 'hmm'}]}}),
      ])
      const types = got.map((c) => c.type)
      expect(types).toContain(EventType.REASONING_MESSAGE_START)
      expect(types).toContain(EventType.REASONING_MESSAGE_CONTENT)
      expect(types).toContain(EventType.REASONING_MESSAGE_END)
    })

    it('emits TOOL_CALL_START/ARGS/END for a tool_use block and TOOL_CALL_RESULT for a tool_result', async () => {
      const got = await collect([
        JSON.stringify({
          type: 'assistant',
          message: {content: [{type: 'tool_use', id: 'tu1', name: 'Bash', input: {command: 'ls'}}]},
        }),
        JSON.stringify({
          type: 'user',
          message: {content: [{type: 'tool_result', tool_use_id: 'tu1', content: 'a\nb'}]},
        }),
      ])
      const start = got.find((c) => c.type === EventType.TOOL_CALL_START)
      expect(strField(start, 'toolCallId')).toBe('tu1')
      expect(strField(start, 'toolCallName')).toBe('Bash')
      const argsChunk = got.find((c) => c.type === EventType.TOOL_CALL_ARGS)
      const argsDelta: unknown = JSON.parse(strField(argsChunk, 'delta') ?? '{}')
      expect(argsDelta).toEqual({command: 'ls'})
      const result = got.find((c) => c.type === EventType.TOOL_CALL_RESULT)
      expect(strField(result, 'toolCallId')).toBe('tu1')
      expect(strField(result, 'content')).toBe('a\nb')
    })

    it('reports the session id from system/result events and skips unparseable lines', async () => {
      const seen: string[] = []
      await collect(['not json', '', JSON.stringify({type: 'result', session_id: 'sess-xyz'})], (id) => seen.push(id))
      expect(seen).toContain('sess-xyz')
    })
  })
  ```

- [ ] **Run** (expect FAIL):

  ```
  pnpm --filter @devgent/harness test claude-decode
  ```

  Expected: FAIL — module `../src/claude/decode.js` not found.

- [ ] **Minimal impl** — create `packages/harness/src/claude/decode.ts`, ported verbatim from `claude-agui-stream.ts`, renaming the export `claudeToAguiEvents` → `decode` and the opts type to the protocol's `HarnessDecodeOpts` (`onSessionId` becomes required — core always supplies it):

  ```ts
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import type {HarnessDecodeOpts} from '@devgent/protocol/harness-types'

  // Translate claude's `--output-format stream-json` NDJSON into a TanStack AI AG-UI event
  // stream (`StreamChunk`s): RUN_STARTED -> (TEXT_MESSAGE_* | REASONING_* | TOOL_CALL_*)* ->
  // RUN_FINISHED. The widget consumes it with fetchServerSentEvents natively. We do NOT route
  // through chat()'s agent loop: claude runs its own tool loop, TanStack AI is purely the
  // transport/UI protocol here.

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
  }

  function parseLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
      // JSON.parse returns `unknown` here (the var is annotated, not asserted — no `as`); the
      // isRecord guard narrows it. Banned-cast-free per the design's typing discipline.
      const v: unknown = JSON.parse(trimmed)
      return isRecord(v) ? v : null
    } catch {
      return null
    }
  }

  function* blockChunks(part: Record<string, unknown>, ids: {n: number}): Generator<StreamChunk> {
    if (part.type === 'text' && typeof part.text === 'string') {
      ids.n += 1
      const messageId = `m${ids.n}`
      yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
      yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: part.text}
      yield {type: EventType.TEXT_MESSAGE_END, messageId}
      return
    }
    if (part.type === 'thinking' && typeof part.thinking === 'string') {
      ids.n += 1
      const messageId = `t${ids.n}`
      yield {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'}
      yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: part.thinking}
      yield {type: EventType.REASONING_MESSAGE_END, messageId}
      return
    }
    if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
      yield {type: EventType.TOOL_CALL_START, toolCallId: part.id, toolCallName: part.name, toolName: part.name}
      yield {type: EventType.TOOL_CALL_ARGS, toolCallId: part.id, delta: JSON.stringify(part.input ?? {})}
      yield {type: EventType.TOOL_CALL_END, toolCallId: part.id}
    }
  }

  function* toolResultChunks(content: unknown, ids: {n: number}): Generator<StreamChunk> {
    if (!Array.isArray(content)) return
    for (const part of content) {
      if (!isRecord(part)) continue
      if (part.type === 'tool_result' && typeof part.tool_use_id === 'string') {
        ids.n += 1
        const text = typeof part.content === 'string' ? part.content : JSON.stringify(part.content ?? '')
        yield {type: EventType.TOOL_CALL_RESULT, messageId: `r${ids.n}`, toolCallId: part.tool_use_id, content: text}
      }
    }
  }

  // Read `.content` off an event's `message` without a cast: narrow the message to a record via
  // isRecord, then index — `unknown` is enough for the array-guarded consumers above.
  function messageContent(message: unknown): unknown {
    return isRecord(message) ? message.content : undefined
  }

  export async function* decode(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
    const threadId = 'devgent-chat'
    const runId = 'devgent-run'
    const ids = {n: 0}
    yield {type: EventType.RUN_STARTED, threadId, runId}
    for await (const line of lines) {
      const e = parseLine(line)
      if (!e) continue
      if ((e.type === 'system' || e.type === 'result') && typeof e.session_id === 'string') {
        opts.onSessionId(e.session_id)
      }
      if (e.type === 'assistant' && isRecord(e.message)) {
        const content = messageContent(e.message)
        if (Array.isArray(content)) {
          for (const part of content) {
            if (isRecord(part)) yield* blockChunks(part, ids)
          }
        }
      }
      if (e.type === 'user' && isRecord(e.message)) {
        yield* toolResultChunks(messageContent(e.message), ids)
      }
    }
    yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
  }
  ```

- [ ] Wire `decode` into `packages/harness/src/claude/claude.ts` (replace the placeholder `decode`):

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'
  import {buildArgs} from './args.js'
  import {decode} from './decode.js'

  export const claude = defineHarness({
    id: 'claude',
    binName: 'claude',
    // transcriptHistory still false until Task 4 wires transcriptPath + parseHistory.
    capabilities: {resume: true, permissionGate: 'hook', transcriptHistory: false, systemPrompt: 'file'},
    buildArgs,
    decode,
    // transcriptPath / parseHistory wired in Task 4.
  })
  ```

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test claude-decode
  ```

  Expected: 4 passed.

- [ ] **Commit**:

  ```
  git add packages/harness/src/claude packages/harness/test/claude-decode.test.ts
  git commit -m "feat(harness): port claude decode (stream-json -> AG-UI StreamChunk)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4 — Port claude history (`transcriptPath` + `parseHistory`)

**Files:**

- `packages/harness/test/claude-history.test.ts` (new)
- `packages/harness/src/claude/history.ts` (new — merges `transcript-path.ts` + `history-parser.ts`)
- `packages/harness/src/claude/claude.ts` (wire `transcriptPath` + `parseHistory`)

Steps:

- [ ] Write the **failing test** `packages/harness/test/claude-history.test.ts`. Asserts `transcriptPath` encoding, that `parseHistory` keeps human turns, and that it filters the internal markers (`VIBE_PROGRESS_TICK`, `NEEDS_INFO:`, `<system-reminder>`):

  ```ts
  import {describe, it, expect} from 'vitest'
  import {transcriptPath, parseHistory} from '../src/claude/history.js'

  describe('claude transcriptPath', () => {
    it('encodes the project dir (non-alphanumeric -> -) under ~/.claude/projects', () => {
      const p = transcriptPath('/Users/x/My Repo', 'sess-1', '/home/u')
      expect(p).toBe('/home/u/.claude/projects/-Users-x-My-Repo/sess-1.jsonl')
    })
  })

  describe('claude parseHistory', () => {
    const jsonl = [
      JSON.stringify({type: 'system', subtype: 'init', session_id: 's'}),
      JSON.stringify({type: 'user', message: {content: [{type: 'text', text: 'add a button'}]}}),
      JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'done'}]}}),
      JSON.stringify({type: 'user', message: {content: [{type: 'text', text: 'VIBE_PROGRESS_TICK keep going'}]}}),
      JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'NEEDS_INFO: which file?'}]}}),
      JSON.stringify({type: 'user', message: {content: [{type: 'text', text: '<system-reminder> internal'}]}}),
      'garbage-not-json',
    ].join('\n')

    it('keeps real human/assistant turns and drops internal markers + bad lines + system records', () => {
      const msgs = parseHistory(jsonl)
      const texts = msgs.flatMap((m) => m.parts).map((p) => ('content' in p ? p.content : ''))
      expect(texts).toContain('add a button')
      expect(texts).toContain('done')
      expect(texts.join('\n')).not.toContain('VIBE_PROGRESS_TICK')
      expect(texts.join('\n')).not.toContain('NEEDS_INFO:')
      expect(texts.join('\n')).not.toContain('<system-reminder>')
      expect(msgs).toHaveLength(2)
      expect(msgs[0]?.role).toBe('user')
      expect(msgs[1]?.role).toBe('assistant')
    })

    it('maps tool_use blocks to tool-call parts', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: {content: [{type: 'tool_use', id: 'tu1', name: 'Bash', input: {command: 'ls'}}]},
      })
      const msgs = parseHistory(raw)
      const part = msgs[0]?.parts[0]
      expect(part).toMatchObject({type: 'tool-call', id: 'tu1', name: 'Bash', state: 'input-complete'})
    })
  })
  ```

- [ ] **Run** (expect FAIL):

  ```
  pnpm --filter @devgent/harness test claude-history
  ```

  Expected: FAIL — module `../src/claude/history.js` not found.

- [ ] **Minimal impl** — create `packages/harness/src/claude/history.ts`. Merge the two old files; **convert** the old inline-IIFE `try/catch` JSON parse in `parseHistory` to a named `parseLine` function (per the no-IIFE rule):

  ```ts
  import {homedir} from 'node:os'
  import {join} from 'node:path'
  import type {MessagePart, UIMessage} from '@devgent/protocol/chat-types'

  // --- transcript path (ported from transcript-path.ts) ---

  // Claude encodes the project dir by replacing every non-alphanumeric path char with '-'.
  function encodeProjectDir(cwd: string): string {
    return cwd.replace(/[^a-zA-Z0-9]/g, '-')
  }

  // Where claude persists a session's JSONL transcript:
  // ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
  export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
    return join(home, '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
  }

  // --- history parser (ported from history-parser.ts) ---

  // Internal turns we hide from the human-readable chat history: the injected progress ticks,
  // NEEDS_INFO sentinels, and system-reminder wrappers the iterate loop adds.
  const INTERNAL_MARKERS = ['VIBE_PROGRESS_TICK', 'NEEDS_INFO:', '<system-reminder>']

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
  }

  function partsFrom(content: unknown): MessagePart[] {
    if (!Array.isArray(content)) return []
    const out: MessagePart[] = []
    for (const part of content) {
      if (!isRecord(part)) continue
      if (part.type === 'text' && typeof part.text === 'string') out.push({type: 'text', content: part.text})
      if (part.type === 'thinking' && typeof part.thinking === 'string')
        out.push({type: 'thinking', content: part.thinking})
      if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
        out.push({
          type: 'tool-call',
          id: part.id,
          name: part.name,
          arguments: JSON.stringify(part.input ?? {}),
          state: 'input-complete',
        })
      }
    }
    return out
  }

  function isInternal(parts: MessagePart[]): boolean {
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => ('content' in p ? p.content : ''))
      .join('\n')
    return INTERNAL_MARKERS.some((m) => text.includes(m))
  }

  function parseLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
      // Annotated, not asserted — no `as`. isRecord narrows before return.
      const v: unknown = JSON.parse(trimmed)
      return isRecord(v) ? v : null
    } catch {
      return null
    }
  }

  // Read `.content` off a record-narrowed message without a cast.
  function messageContent(message: unknown): unknown {
    return isRecord(message) ? message.content : undefined
  }

  // Parse a claude session JSONL transcript into filtered, human-readable UIMessages. Drops
  // system/meta records + internal iterate/progress prompts. Tolerant of format drift.
  export function parseHistory(raw: string): UIMessage[] {
    const out: UIMessage[] = []
    const idState = {n: 0}
    for (const line of raw.split('\n')) {
      const e = parseLine(line)
      if (!e) continue
      if (e.type !== 'user' && e.type !== 'assistant') continue
      if (!isRecord(e.message)) continue
      const parts = partsFrom(messageContent(e.message))
      if (parts.length === 0 || isInternal(parts)) continue
      idState.n += 1
      out.push({id: `h${idState.n}`, role: e.type, parts})
    }
    return out
  }
  ```

- [ ] Wire into `packages/harness/src/claude/claude.ts` (final form):

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'
  import {buildArgs} from './args.js'
  import {decode} from './decode.js'
  import {transcriptPath, parseHistory} from './history.js'

  // Final claude form: transcriptHistory flips to true together with transcriptPath +
  // parseHistory, so defineHarness's `transcriptHistory ⇒ transcriptPath && parseHistory`
  // invariant is satisfied at module-load.
  export const claude = defineHarness({
    id: 'claude',
    binName: 'claude',
    capabilities: {resume: true, permissionGate: 'hook', transcriptHistory: true, systemPrompt: 'file'},
    buildArgs,
    decode,
    transcriptPath,
    parseHistory,
  })
  ```

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test claude-history
  ```

  Expected: 3 passed.

- [ ] Also port `chat-system-prompt.ts` → `packages/harness/src/claude/system-prompt.ts` (verbatim copy of the `CHAT_SYSTEM_PROMPT` const; no test — it is a static string consumed by core). Keep the export name `CHAT_SYSTEM_PROMPT`. (Core reads this when `systemPrompt` config is unset; included here so the claude-specific default lives with its adapter.)

- [ ] **Run** the whole package suite + typecheck to confirm claude is fully ported:

  ```
  pnpm --filter @devgent/harness test && pnpm --filter @devgent/harness typecheck
  ```

  Expected: all claude + registry tests pass; typecheck clean.

- [ ] **Commit**:

  ```
  git add packages/harness/src/claude packages/harness/test/claude-history.test.ts
  git commit -m "feat(harness): port claude history + system-prompt; complete claude adapter

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5 — Confirm the codex `exec` JSON event schema (RESEARCH gate, no code)

> The decode mapping in Task 6 is only as correct as this research. The codex CLI's JSON event stream + sandbox/approval model **must be verified against the current `codex` CLI at implementation time** — do NOT code `decode` from this plan's guess. This task is a hard gate before Task 6.

**Files:** none (research only; record findings in the Task 6 test as fixtures).

Steps:

- [ ] Determine the exact streaming invocation. Run locally if `codex` is on PATH; otherwise read current docs (`codex exec --help`, the OpenAI Codex CLI repo/docs). Confirm:
  - The non-interactive subcommand (expected `codex exec "<prompt>"`) and the flag that emits machine-readable JSON events to stdout (expected something like `--json` / `--experimental-json` — **verify the exact flag name**).
  - The flag that sets the system / developer instructions (the design predicts `systemPrompt:'flag'` — confirm the exact flag, e.g. `--instructions` or `-c`/config; record it).
  - The sandbox/approval model: confirm there is **no mid-turn HTTP approval callback** (→ `permissionGate:'none'` is correct) and note the sandbox flag (e.g. `--sandbox`/`--full-auto`) the adapter should set so the turn is non-interactive.
  - Whether sessions can be resumed non-interactively (→ `resume`) and whether a readable transcript is persisted to disk (→ `transcriptHistory`). If either is unclear or unsupported in `exec` mode, set the capability to `false` (graceful: core just starts fresh / hydrates from the live thread).

- [ ] Capture **2-3 real sample JSON event lines** for: an assistant text delta/message, a tool/command execution, and the terminal/result event (the one that carries usage or a session/thread id). These become the verbatim fixtures in Task 6's `codex-decode.test.ts`. Map each codex event onto a `StreamChunk`:

  | codex event (verify exact field names)        | StreamChunk                                                                            |
  | --------------------------------------------- | -------------------------------------------------------------------------------------- |
  | session/thread id on the init or result event | call `opts.onSessionId(id)`                                                            |
  | assistant message / text delta                | `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT{delta}` → `TEXT_MESSAGE_END`              |
  | reasoning / thinking delta (if present)       | `REASONING_MESSAGE_*`                                                                  |
  | command / tool begin                          | `TOOL_CALL_START{toolCallId,toolCallName}` + `TOOL_CALL_ARGS{delta}` + `TOOL_CALL_END` |
  | command / tool output                         | `TOOL_CALL_RESULT{toolCallId,content}`                                                 |
  | turn complete / result                        | (stream wrapper emits `RUN_FINISHED`)                                                  |

- [ ] Record the confirmed capability shape for codex (fill the `?`s):
  - `resume`: \_\_\_\_ (default to `false` if `exec` can't resume)
  - `permissionGate`: `'none'` (confirmed: no HTTP gate)
  - `transcriptHistory`: \_\_\_\_ (default to `false` if no readable transcript)
  - `systemPrompt`: `'flag'` (record the exact flag name)

- [ ] **No commit** (no files changed). Proceed to Task 6 only once the event field names + flag names are written into Task 6's fixtures/impl.

---

## Task 6 — codex adapter (PROOF) — `args` + `decode` + `codex.ts`

**Files:**

- `packages/harness/test/codex-args.test.ts` (new)
- `packages/harness/test/codex-decode.test.ts` (new)
- `packages/harness/src/codex/args.ts` (new)
- `packages/harness/src/codex/decode.ts` (new)
- `packages/harness/src/codex/codex.ts` (replace placeholder)

> Substitute the **verified** flag/event names from Task 5 wherever this plan shows a `// VERIFY` placeholder. The structure below is fixed; the literals are research-driven.

Steps:

- [ ] Write the **failing test** `packages/harness/test/codex-args.test.ts`:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {buildArgs} from '../src/codex/args.js'
  import type {HarnessTurn} from '@devgent/protocol/harness-types'

  const base: HarnessTurn = {prompt: 'fix the bug', cwd: '/repo', resumeSessionId: null, systemPrompt: ''}

  describe('codex buildArgs', () => {
    it('invokes `exec` with the prompt and the JSON-events + non-interactive sandbox flags', () => {
      const args = buildArgs(base)
      expect(args[0]).toBe('exec')
      expect(args).toContain('fix the bug')
      expect(args).toContain('--json') // VERIFY exact flag in Task 5
      expect(args).toContain('--sandbox') // VERIFY exact flag/value in Task 5
    })

    it('passes the system prompt via the instructions flag when provided (systemPrompt:flag)', () => {
      const args = buildArgs({...base, systemPrompt: 'you are devgent'})
      const i = args.indexOf('--instructions') // VERIFY exact flag in Task 5
      expect(i).toBeGreaterThan(-1)
      expect(args[i + 1]).toBe('you are devgent')
    })

    it('never adds a --settings/permission hook (permissionGate is none)', () => {
      const args = buildArgs({...base, permissionUrl: 'http://h/__pw/chat/permission'})
      expect(args).not.toContain('--settings')
      expect(args.join(' ')).not.toContain('permission')
    })
  })
  ```

- [ ] **Run** (expect FAIL):

  ```
  pnpm --filter @devgent/harness test codex-args
  ```

  Expected: FAIL — module `../src/codex/args.js` not found.

- [ ] **Minimal impl** — `packages/harness/src/codex/args.ts` (replace `// VERIFY` literals with the Task-5 confirmed names). Note: `systemPrompt:'flag'` means core passes the prompt **text** (not a file path) as `turn.systemPrompt`:

  ```ts
  import type {HarnessTurn} from '@devgent/protocol/harness-types'

  // Build the non-interactive `codex exec` argv for a chat turn: stream machine-readable JSON
  // events to stdout, run in a non-interactive sandbox (no mid-turn approval — codex governs
  // risky ops via its own sandbox, so devgent registers no permission gate for it). System
  // instructions go via a flag (systemPrompt:'flag'); permissionUrl is ignored.
  export function buildArgs(turn: HarnessTurn): string[] {
    const args = ['exec', turn.prompt, '--json', '--sandbox'] // VERIFY flag names in Task 5
    if (turn.systemPrompt) args.push('--instructions', turn.systemPrompt) // VERIFY flag name
    if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId) // include only if resume verified true
    return args
  }
  ```

- [ ] **Run PASS** `codex-args`. Expected: 3 passed.

- [ ] Write the **failing test** `packages/harness/test/codex-decode.test.ts` using the **verbatim sample lines captured in Task 5**:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import {decode} from '../src/codex/decode.js'

  async function* lines(arr: string[]): AsyncGenerator<string> {
    for (const l of arr) yield l
  }
  async function collect(input: string[], onSessionId = (_: string) => {}): Promise<StreamChunk[]> {
    const out: StreamChunk[] = []
    for await (const c of decode(lines(input), {onSessionId})) out.push(c)
    return out
  }

  // NOTE: replace these with the ACTUAL codex JSON event lines captured in Task 5.
  const SAMPLE_TEXT = JSON.stringify({
    /* VERIFY: codex assistant text event shape */
  })
  const SAMPLE_RESULT = JSON.stringify({
    /* VERIFY: codex result/session event shape */
  })

  describe('codex decode', () => {
    it('wraps the stream in RUN_STARTED .. RUN_FINISHED', async () => {
      const got = await collect([SAMPLE_TEXT, SAMPLE_RESULT])
      expect(got[0]?.type).toBe(EventType.RUN_STARTED)
      expect(got.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    })

    it('emits TEXT_MESSAGE_* for an assistant text event', async () => {
      const got = await collect([SAMPLE_TEXT])
      expect(got.map((c) => c.type)).toContain(EventType.TEXT_MESSAGE_CONTENT)
    })

    it('reports the codex session/thread id', async () => {
      const seen: string[] = []
      await collect([SAMPLE_RESULT], (id) => seen.push(id))
      expect(seen.length).toBeGreaterThan(0)
    })
  })
  ```

- [ ] **Run** (expect FAIL) `codex-decode`. Expected: FAIL — `../src/codex/decode.js` not found.

- [ ] **Minimal impl** — `packages/harness/src/codex/decode.ts`. Same RUN_STARTED → … → RUN_FINISHED envelope as claude; the per-event `switch`/`if` maps the **verified** codex event types onto `StreamChunk`s (fill the `// VERIFY` branches from Task 5). Reuse the `isRecord`/`parseLine` helper shape:

  ```ts
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import type {HarnessDecodeOpts} from '@devgent/protocol/harness-types'

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
  }
  function parseLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
      // Annotated, not asserted — no `as`. isRecord narrows before return.
      const v: unknown = JSON.parse(trimmed)
      return isRecord(v) ? v : null
    } catch {
      return null
    }
  }

  // Translate `codex exec --json` events into the same AG-UI StreamChunk envelope the widget
  // already speaks. Event field names are VERIFIED against the current codex CLI in Task 5.
  export async function* decode(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
    const threadId = 'devgent-chat'
    const runId = 'devgent-run'
    const ids = {n: 0}
    yield {type: EventType.RUN_STARTED, threadId, runId}
    for await (const line of lines) {
      const e = parseLine(line)
      if (!e) continue
      // Narrow `e` (a Record<string, unknown>) by switching on its discriminant `e.type` and
      // guarding each payload field with `typeof` — NO `as`/angle-bracket casts (typing-discipline
      // hard rule). Each branch is the codex equivalent of claude's blockChunks discriminated union.
      // VERIFY: pull the session/thread id off the codex init/result event field.
      // if (typeof e.session_id === 'string') opts.onSessionId(e.session_id)
      // VERIFY: assistant text event -> TEXT_MESSAGE_*; reasoning -> REASONING_*;
      //         command begin -> TOOL_CALL_START/ARGS/END; command output -> TOOL_CALL_RESULT.
      // Example skeleton for an assistant text event named 'item.completed' with item.text — note
      // the guard (`typeof e.text === 'string'`) narrows e.text to string with no cast:
      // if (e.type === 'assistant_text' && typeof e.text === 'string') {
      //   ids.n += 1
      //   const messageId = `m${ids.n}`
      //   yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
      //   yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: e.text}
      //   yield {type: EventType.TEXT_MESSAGE_END, messageId}
      // }
    }
    yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
  }
  ```

  > Implement the real branches against the captured fixtures so the `codex-decode` test asserting `TEXT_MESSAGE_CONTENT` + `onSessionId` passes. The `ids` counter must be referenced (avoids an unused-var lint error) by the text branch.

- [ ] **Run PASS** `codex-decode`. Expected: 3 passed.

- [ ] Replace the placeholder `packages/harness/src/codex/codex.ts` with the verified capabilities:

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'
  import {buildArgs} from './args.js'
  import {decode} from './decode.js'

  // Capability shape CONFIRMED in Task 5. resume/transcriptHistory default to false unless the
  // codex `exec` mode is verified to support them. permissionGate:'none' — codex governs risky
  // ops via its own sandbox, so devgent wires no /permission route for it. systemPrompt:'flag'.
  // Constraint A: defined through defineHarness, never a bare literal.
  export const codex = defineHarness({
    id: 'codex',
    binName: 'codex',
    capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
    buildArgs,
    decode,
  })
  ```

  > If Task 5 verified `transcriptHistory: true`, also add `transcriptPath` + `parseHistory` here — `defineHarness` will THROW at module-load otherwise (its `transcriptHistory ⇒ transcriptPath && parseHistory` invariant), which is exactly what the capability-matrix test in Task 9 also enforces.

- [ ] **Run PASS** + typecheck:

  ```
  pnpm --filter @devgent/harness test codex && pnpm --filter @devgent/harness typecheck
  ```

  Expected: codex-args + codex-decode green; typecheck clean.

- [ ] **Commit**:

  ```
  git add packages/harness/src/codex packages/harness/test/codex-args.test.ts packages/harness/test/codex-decode.test.ts
  git commit -m "feat(harness): codex exec adapter (proof) — verified args + decode

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7 — gemini-cli / opencode / pi capability-only stubs

**Files:**

- `packages/harness/src/gemini-cli/gemini-cli.ts` (replace placeholder)
- `packages/harness/src/opencode/opencode.ts` (replace placeholder)
- `packages/harness/src/pi/pi.ts` (replace placeholder)
- `packages/harness/test/stubs.test.ts` (new)

Steps:

- [ ] Write the **failing test** `packages/harness/test/stubs.test.ts`:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {geminiCli} from '../src/gemini-cli/gemini-cli.js'
  import {opencode} from '../src/opencode/opencode.js'
  import {pi} from '../src/pi/pi.js'
  import type {HarnessTurn} from '@devgent/protocol/harness-types'

  const turn: HarnessTurn = {prompt: 'x', cwd: '/r', resumeSessionId: null, systemPrompt: ''}

  describe.each([
    ['gemini-cli', geminiCli],
    ['opencode', opencode],
    ['pi', pi],
  ])('%s stub', (id, adapter) => {
    it('declares its id and capabilities', () => {
      expect(adapter.id).toBe(id)
      expect(adapter.capabilities).toBeDefined()
    })
    it('throws "not implemented" from buildArgs', () => {
      expect(() => adapter.buildArgs(turn)).toThrow(/not implemented/)
    })
  })
  ```

- [ ] **Run** (expect FAIL — placeholders return `[]` from `buildArgs`, don't throw):

  ```
  pnpm --filter @devgent/harness test stubs
  ```

  Expected: FAIL — `buildArgs` does not throw.

- [ ] **Minimal impl** — each stub declares its best-guess capabilities (research-confirmed later) and throws from the not-yet-supported methods. Example `packages/harness/src/gemini-cli/gemini-cli.ts`:

  ```ts
  import {defineHarness} from '@devgent/protocol/harness-types'

  // Capability-only stub. Capabilities are a placeholder pending CLI research; buildArgs/decode
  // throw until the adapter is implemented. Registered so listHarnesses() advertises it and the
  // capability-matrix test guards the contract. Constraint A: defined through defineHarness, not
  // a bare literal — even stubs go through the factory so the contract is enforced + inferred.
  export const geminiCli = defineHarness({
    id: 'gemini-cli',
    binName: 'gemini',
    capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
    buildArgs() {
      throw new Error('gemini-cli harness not implemented')
    },
    // eslint-disable-next-line require-yield
    async *decode() {
      throw new Error('gemini-cli harness not implemented')
    },
  })
  ```

  `packages/harness/src/opencode/opencode.ts` (`id:'opencode'`, `binName:'opencode'`) and `packages/harness/src/pi/pi.ts` (`id:'pi'`, `binName:'pi'`) follow the same shape with their own messages.

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test stubs
  ```

  Expected: 6 passed (3 adapters × 2 cases).

- [ ] **Commit**:

  ```
  git add packages/harness/src/gemini-cli packages/harness/src/opencode packages/harness/src/pi packages/harness/test/stubs.test.ts
  git commit -m "feat(harness): gemini-cli/opencode/pi capability-only stubs

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8 — Generic `fake-harness.ts` fixture + permissionGate:'none' IT

**Files:**

- `packages/harness/test/fixtures/fake-harness.ts` (new — generalizes `fake-claude.ts`)
- `packages/harness/test/harness.it.test.ts` (new)

Steps:

- [ ] Write the **failing IT** `packages/harness/test/harness.it.test.ts`. It drives **any** adapter end-to-end through a real spawned `fake-harness` child whose output stream is named by an env var, and proves: (a) a generic adapter's `decode` produces RUN_STARTED…RUN_FINISHED from real child stdout; (b) a `permissionGate:'none'` adapter carries no permission wiring (no `--settings`, no `permissionUrl` consumption) — the gate is skipped cleanly:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {spawn} from 'node:child_process'
  import {createInterface} from 'node:readline'
  import {fileURLToPath} from 'node:url'
  import type {Readable} from 'node:stream'
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import {codex} from '../src/codex/codex.js'
  import {claude} from '../src/claude/claude.js'

  const fakeHarness = fileURLToPath(new URL('fixtures/fake-harness.ts', import.meta.url))

  async function* linesOf(stream: Readable): AsyncGenerator<string> {
    const rl = createInterface({input: stream, crlfDelay: Infinity})
    for await (const line of rl) yield line
  }

  function spawnFake(format: 'claude' | 'codex'): Readable {
    const child = spawn(process.execPath, [fakeHarness], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, DEVGENT_FAKE_FORMAT: format},
    })
    return child.stdout!
  }

  describe('harness seam (IT, real spawn via fake-harness)', () => {
    it('decodes a claude-format child stream into RUN_STARTED .. RUN_FINISHED', async () => {
      const out: StreamChunk[] = []
      for await (const c of claude.decode(linesOf(spawnFake('claude')), {onSessionId: () => {}})) out.push(c)
      expect(out[0]?.type).toBe(EventType.RUN_STARTED)
      expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
      expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
    })

    it('a permissionGate:none harness (codex) builds argv with no permission gate even if a permissionUrl is offered', () => {
      expect(codex.capabilities.permissionGate).toBe('none')
      const args = codex.buildArgs({
        prompt: 'p',
        cwd: '/r',
        resumeSessionId: null,
        systemPrompt: '',
        permissionUrl: 'http://h/__pw/chat/permission',
      })
      expect(args).not.toContain('--settings')
      expect(args.join(' ')).not.toContain('permission')
    })

    it('decodes a codex-format child stream into RUN_STARTED .. RUN_FINISHED', async () => {
      const out: StreamChunk[] = []
      for await (const c of codex.decode(linesOf(spawnFake('codex')), {onSessionId: () => {}})) out.push(c)
      expect(out[0]?.type).toBe(EventType.RUN_STARTED)
      expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    })
  })
  ```

- [ ] **Run** (expect FAIL — fixture missing):

  ```
  pnpm --filter @devgent/harness test harness.it
  ```

  Expected: FAIL — `fixtures/fake-harness.ts` not found / spawn error.

- [ ] **Minimal impl** — `packages/harness/test/fixtures/fake-harness.ts`. A real executable (NOT a JS mock — spawned as a child to exercise the true stdout-pipe path), generalizing `fake-claude.ts`: it picks the output transcript by `DEVGENT_FAKE_FORMAT` (`claude` | `codex`), echoes argv to `DEVGENT_TEST_ARGV_FILE` when set, and hangs until SIGTERM under `DEVGENT_FAKE_HANG`. Use **named functions**, no IIFE. The `codex` lines must match the verified Task-5 event shape:

  ```ts
  // Real executable standing in for a harness CLI in harness ITs — spawned as a child to
  // exercise the true spawn -> stdout-pipe -> decode path. Replays a format-specific transcript
  // selected by DEVGENT_FAKE_FORMAT. Echoes argv (DEVGENT_TEST_ARGV_FILE) so a test can assert
  // --resume; hangs until SIGTERM under DEVGENT_FAKE_HANG to exercise Stop.
  import {writeFileSync} from 'node:fs'

  function claudeLines(): unknown[] {
    return [
      {type: 'system', subtype: 'init', session_id: 'sess-fake'},
      {type: 'assistant', message: {content: [{type: 'text', text: 'hello from fake'}]}},
      {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
    ]
  }

  // VERIFY in Task 5: replace with the real codex exec --json event shapes.
  function codexLines(): unknown[] {
    return [
      {
        /* codex init/session event with a session id */
      },
      {
        /* codex assistant text event with text 'hello from fake' */
      },
      {
        /* codex result event */
      },
    ]
  }

  function transcript(format: string): unknown[] {
    return format === 'codex' ? codexLines() : claudeLines()
  }

  function main(): void {
    const argv = process.argv.slice(2)
    const argvFile = process.env.DEVGENT_TEST_ARGV_FILE
    if (argvFile) writeFileSync(argvFile, JSON.stringify(argv))

    if (process.env.DEVGENT_FAKE_HANG) {
      process.on('SIGTERM', () => process.exit(143))
      setInterval(() => {}, 1000)
      return
    }
    for (const line of transcript(process.env.DEVGENT_FAKE_FORMAT ?? 'claude')) {
      process.stdout.write(JSON.stringify(line) + '\n')
    }
    process.exit(0)
  }

  main()
  ```

  > `main()` is a top-level call to a named function, not an IIFE — compliant with the no-IIFE rule. Fill `codexLines()` with the Task-5 fixtures so the codex IT's `RUN_FINISHED` assertion (and any `TEXT_MESSAGE_CONTENT` you assert) passes.

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/harness test harness.it
  ```

  Expected: 3 passed.

- [ ] **Commit**:

  ```
  git add packages/harness/test/fixtures/fake-harness.ts packages/harness/test/harness.it.test.ts
  git commit -m "test(harness): generic fake-harness fixture + permissionGate:none skip IT

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 9 — Capability-matrix unit test

**Files:**

- `packages/harness/test/capability-matrix.test.ts` (new)

Steps:

- [ ] Write the **failing test** `packages/harness/test/capability-matrix.test.ts`. Iterates every **non-stub** registered adapter and asserts the contract invariants from the design's testing strategy — chiefly `transcriptHistory ⇒ transcriptPath && parseHistory` both defined (and the converse: if `transcriptHistory` is false, they should be absent). Stubs throw from `buildArgs`, so the matrix asserts only the declarative capability/method coupling, not behaviour:

  ```ts
  import {describe, it, expect} from 'vitest'
  import {listHarnesses} from '../src/registry.js'

  const STUB_IDS = new Set(['gemini-cli', 'opencode', 'pi'])

  describe('harness capability matrix', () => {
    for (const adapter of listHarnesses().filter((a) => !STUB_IDS.has(a.id))) {
      describe(adapter.id, () => {
        it('transcriptHistory <=> transcriptPath && parseHistory are both defined', () => {
          if (adapter.capabilities.transcriptHistory) {
            expect(typeof adapter.transcriptPath).toBe('function')
            expect(typeof adapter.parseHistory).toBe('function')
          } else {
            expect(adapter.transcriptPath).toBeUndefined()
            expect(adapter.parseHistory).toBeUndefined()
          }
        })

        it('declares a non-empty id, binName, and a decode generator', () => {
          expect(adapter.id).toBeTruthy()
          expect(adapter.binName).toBeTruthy()
          expect(typeof adapter.decode).toBe('function')
        })

        it('permissionGate is one of hook|none and systemPrompt one of file|flag|none', () => {
          expect(['hook', 'none']).toContain(adapter.capabilities.permissionGate)
          expect(['file', 'flag', 'none']).toContain(adapter.capabilities.systemPrompt)
        })
      })
    }
  })
  ```

- [ ] **Run** (expect FAIL only if an adapter violates the invariant; otherwise it passes immediately — in which case temporarily break claude's `claude.ts` by removing `parseHistory` to SEE it go RED, then restore). Standard cmd:

  ```
  pnpm --filter @devgent/harness test capability-matrix
  ```

  Expected first run: PASS (claude: transcriptHistory true + both methods; codex: transcriptHistory false + both undefined). Demonstrate RED by deleting `parseHistory` from `claude.ts` → re-run → FAIL `claude > transcriptHistory <=> ...` → restore → PASS. This proves the test bites.

- [ ] **Run PASS** (after restore) the whole suite + typecheck + lint:

  ```
  pnpm --filter @devgent/harness test && pnpm --filter @devgent/harness typecheck && pnpm --filter @devgent/harness lint
  ```

  Expected: all green.

- [ ] **Commit**:

  ```
  git add packages/harness/test/capability-matrix.test.ts
  git commit -m "test(harness): capability-matrix — transcriptHistory implies path+parser

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 10 — Extract claude OUT of `@devgent/core`; depend on `@devgent/harness`

**Files:**

- `packages/core/package.json` (add `@devgent/harness` dependency)
- `packages/core/src/` — delete the inline claude files Plan 1 left in core (`claude/args.ts`, `claude/decode.ts`, `claude/history.ts`, `claude/system-prompt.ts`, and the inline `registry.ts` if core had its own) — wherever Plan 1 placed them. Confirm exact paths with `git grep -l buildArgs packages/core/src` before deleting.
- `packages/core/tsdown.config.ts` (drop any now-deleted entries)

Steps:

- [ ] Add the dependency to `packages/core/package.json`:

  ```json
  "@devgent/harness": "workspace:*"
  ```

  then:

  ```
  pnpm install
  ```

- [ ] Locate every core import of the inline claude modules:

  ```
  git grep -nE "claude/(args|decode|history|system-prompt)|getHarness|registerHarness" packages/core/src
  ```

  Record the importers (chiefly the chat route + the engine boot file).

- [ ] **Run** the core suite to capture the GREEN baseline before the move:

  ```
  pnpm --filter @devgent/core test
  ```

  Expected: PASS (Plan 1 left it green). This is the regression guard for the extraction.

- [ ] Repoint core's imports from its inline claude modules to `@devgent/harness`:
  - `import {getHarness, listHarnesses} from '@devgent/harness'` (the registry — package entry `.`)
  - The default-resolution helper now calls `getHarness(config.harness ?? 'claude')`.
  - The claude default system prompt: `import {CHAT_SYSTEM_PROMPT} from '@devgent/harness/claude'`? — NO: keep core's `systemPrompt` resolution generic. If core needs a fallback prompt only when none is configured, read it from the resolved adapter's package via `@devgent/harness/claude` **only inside the claude-specific default path**, or (preferred) keep core's existing generic default prompt and let the adapter's `systemPrompt` capability decide delivery. Choose the generic path to avoid coupling core to claude.

- [ ] Delete the now-duplicated inline claude files from `packages/core/src` (the harness package owns them now) and remove their entries from `packages/core/tsdown.config.ts`.

- [ ] **Run PASS** (no behaviour change — core now resolves claude from `@devgent/harness`):

  ```
  pnpm --filter @devgent/core test && pnpm --filter @devgent/core typecheck
  ```

  Expected: the same green suite; zero new failures.

- [ ] **Commit**:

  ```
  git add packages/core packages/harness pnpm-lock.yaml
  git commit -m "refactor(core): resolve claude from @devgent/harness; drop inline copy

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 11 — Core feature-detection by capability

**Files:**

- `packages/core/src/chat-route.ts` (conditional `/permission`, `/history`, prompt prepend)
- `packages/core/src/<engine boot file>.ts` (resolve adapter once; pass capabilities + `permissionUrl` only when `permissionGate==='hook'`)
- `packages/core/test/chat-route.it.test.ts` (extend; add a `permissionGate:'none'` case)

> The chat route already takes a resolved `HarnessAdapter` (Plan 1). This task makes the route's **route registration + turn assembly** conditional on `adapter.capabilities`, per the design's degradation table.

Steps:

- [ ] Write the **failing test** — extend `packages/core/test/chat-route.it.test.ts` with a fixture that drives the route with a synthetic **`permissionGate:'none'`** adapter and asserts the gate is fully skipped: no `--settings` in argv, `permissionUrl` never set on the turn, and `POST /__pw/chat/permission` returns **404** (route not wired). Also assert that with a `transcriptHistory:false` adapter, `GET /__pw/chat/history` returns 404. Sketch:

  ```ts
  import {describe, it, expect, afterEach} from 'vitest'
  import {createServer, type Server} from 'node:http'
  import {EventType, type StreamChunk} from '@tanstack/ai'
  import {defineHarness, type HarnessAdapter} from '@devgent/protocol/harness-types'
  import {makeChatRoute} from '../src/chat-route.js'
  // ... existing tmp()/postJson()/startServer() helpers, generalized to accept an adapter ...

  // Synthetic adapter — also defined through defineHarness (Constraint A: no bare adapter
  // literals anywhere, including test fixtures). transcriptHistory:false with no history methods
  // satisfies the factory's invariant.
  function noGateAdapter(captured: {args?: string[]}): HarnessAdapter {
    return defineHarness({
      id: 'fake-none',
      binName: 'node',
      capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
      buildArgs: (turn) => {
        const args = ['exec', turn.prompt]
        if (turn.systemPrompt) args.push('--instructions', turn.systemPrompt)
        captured.args = args
        return args
      },
      async *decode(_lines, _opts): AsyncGenerator<StreamChunk> {
        yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
        yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
      },
    })
  }

  describe('chat-route capability degradation', () => {
    // afterEach closes the server (reuse existing pattern)

    it('permissionGate:none — no /permission route, no permissionUrl, no --settings', async () => {
      const captured: {args?: string[]} = {}
      const {server, base} = await startServer({adapter: noGateAdapter(captured)})
      // drive a turn
      await (
        await postJson(`${base}/__pw/chat`, {messages: [{role: 'user', parts: [{type: 'text', content: 'hi'}]}]})
      ).text()
      expect(captured.args).not.toContain('--settings')
      expect(captured.args?.join(' ')).not.toContain('permission')
      const perm = await postJson(`${base}/__pw/chat/permission`, {
        tool_name: 'Bash',
        tool_input: {command: 'rm -rf x'},
      })
      expect(perm.status).toBe(404) // route not wired for a no-gate harness
    })

    it('transcriptHistory:false — GET /__pw/chat/history is not wired (404)', async () => {
      const {server, base} = await startServer({adapter: noGateAdapter({})})
      const res = await fetch(`${base}/__pw/chat/history?sessionId=s`)
      expect(res.status).toBe(404)
    })
  })
  ```

- [ ] **Run** (expect FAIL — the route currently wires `/permission` + `/history` unconditionally and always sets `permissionUrl`):

  ```
  pnpm --filter @devgent/core test chat-route
  ```

  Expected: FAIL — `permission` returns 200 not 404; `--settings`/permissionUrl present.

- [ ] **Minimal impl** — make `makeChatRoute` capability-aware. Capture the resolved `adapter` in `ChatRouteOpts` and branch on `adapter.capabilities`. Concrete edits to `packages/core/src/chat-route.ts`:
  1. The route opts already carry the adapter (Plan 1). Read its capabilities once:
     ```ts
     const cap = opts.adapter.capabilities
     ```
  2. Guard the `/permission` + `/permission-decision` handlers behind the hook capability — early-return `next()` so the route 404s when not hook-capable:
     ```ts
     if (url === '/__pw/chat/permission' && req.method === 'POST') {
       if (cap.permissionGate !== 'hook') return next()
       // ... existing decidePermission handling ...
     }
     if (url === '/__pw/chat/permission-decision' && req.method === 'POST') {
       if (cap.permissionGate !== 'hook') return next()
       // ... existing handling ...
     }
     ```
  3. Guard the `/history` handler behind `transcriptHistory` AND the adapter actually exposing the methods:
     ```ts
     if (url.startsWith('/__pw/chat/history') && req.method === 'GET') {
       if (!cap.transcriptHistory || !opts.adapter.transcriptPath || !opts.adapter.parseHistory) return next()
       const sessionId = new URL(url, 'http://x').searchParams.get('sessionId') ?? ''
       // ... use opts.adapter.transcriptPath(opts.cwd, sessionId) + opts.adapter.parseHistory(jsonl) ...
     }
     ```
  4. In the `POST /__pw/chat` turn assembly, build the `HarnessTurn` with capability-driven fields:
     ```ts
     const resumeSessionId = cap.resume ? body.sessionId || state.sessionId || null : null
     const origin = `http://${req.headers?.host ?? '127.0.0.1:3000'}`
     // systemPrompt delivery: 'file' -> path written by core; 'flag' -> raw text; 'none' -> prepend to prompt.
     const sysText = opts.systemPromptText ?? '' // core's resolved prompt string
     const systemPrompt =
       cap.systemPrompt === 'file'
         ? sysText
           ? writeSystemPromptFile(opts.lockDir, sysText)
           : ''
         : cap.systemPrompt === 'flag'
           ? sysText
           : '' // 'none' -> handled by prepend below
     const prompt = cap.systemPrompt === 'none' && sysText ? `${sysText}\n\n${lastUserText(body)}` : lastUserText(body)
     const turn = {
       prompt,
       cwd: opts.cwd,
       resumeSessionId,
       systemPrompt,
       ...(cap.permissionGate === 'hook' ? {permissionUrl: `${origin}/__pw/chat/permission`} : {}),
     }
     const child = opts.spawn(opts.adapter.buildArgs(turn), opts.cwd)
     ```
     where `writeSystemPromptFile(lockDir, text)` writes the prompt to `<lockDir>/.devgent/system-prompt.txt` and returns the path (move the existing claude temp-file write here if Plan 1 had it inline; it is now claude-capability-gated, not claude-specific). `opts.spawn` is the generalized `SpawnHarness` seam (rename from `SpawnClaude`):
     ```ts
     export type HarnessChildProc = {pid: number; stdout: Readable; stderr: Readable; kill: () => void}
     export type SpawnHarness = (args: string[], cwd: string) => HarnessChildProc
     ```
  5. The decode call uses the adapter:
     ```ts
     const events = opts.adapter.decode(linesOf(child.stdout), {
       onSessionId: (id) => {
         state.sessionId = id
         writeSession(opts.lockDir, opts.previewId, id)
       },
     })
     ```

- [ ] In the engine boot file, resolve the adapter once and pass it + the resolved system-prompt text into `makeChatRoute`:

  ```ts
  import {getHarness} from '@devgent/harness'
  // ...
  const adapter = getHarness(config.harness ?? 'claude')
  const systemPromptText = config.systemPrompt ?? defaultSystemPromptFor(adapter)
  const chat = makeChatRoute({cwd, lockDir, previewId, initialSessionId, spawn, adapter, systemPromptText, uiBus})
  ```

  `defaultSystemPromptFor(adapter)` returns `CHAT_SYSTEM_PROMPT` for claude (import from `@devgent/harness/claude`) and `''` otherwise — keep this the ONLY claude-name reference in core, isolated in one helper.

- [ ] **Run PASS**:

  ```
  pnpm --filter @devgent/core test chat-route
  ```

  Expected: the new degradation cases pass AND the existing claude (hook) cases still pass — `/permission` allow/deny + `--resume` on turn 2 unchanged for claude.

- [ ] **Run PASS** the full core suite + typecheck:

  ```
  pnpm --filter @devgent/core test && pnpm --filter @devgent/core typecheck
  ```

  Expected: green.

- [ ] **Commit**:

  ```
  git add packages/core
  git commit -m "feat(core): feature-detect harness capabilities — gate /permission, /history, system-prompt delivery

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 12 — Repo-wide green + final verification

**Files:** none (verification only).

Steps:

- [ ] **Run** the whole monorepo to prove nothing downstream broke:

  ```
  pnpm build && pnpm typecheck && pnpm test && pnpm lint
  ```

  Expected: all packages green. Pay attention to `@devgent/widget` browser ITs and `@devgent/cli` — they consume core's routes and must be unaffected (claude path unchanged in behaviour).

- [ ] Grep for stragglers — the word "claude" must not appear in core outside the single `defaultSystemPromptFor` helper:

  ```
  git grep -niE "claude" packages/core/src
  ```

  Expected: only the isolated default-prompt helper line.

- [ ] Confirm no `index.ts`, no IIFE, no class introduced:

  ```
  git grep -nE "index\.ts|\bclass \b|\(\s*function|\}\)\(\)" packages/harness/src
  ```

  Expected: no matches (the `main()` in `fake-harness.ts` is a named call, not an IIFE — it is under `test/`, not `src/`, and is allowed regardless).

- [ ] **Commit** any final formatting fixes only if `pnpm format` changed files:

  ```
  git add -A && git commit -m "chore(harness): repo-wide green after harness seam extraction

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-Review

Run before declaring the plan complete (executor checklist):

- [ ] **Scope match** — `@devgent/harness` exists with NO `index.ts`; subpath exports `.` (registry), `./claude`, `./codex`, `./gemini-cli`, `./opencode`, `./pi` all resolve to named files; registered in the pnpm workspace (`packages/*` glob) and installed.
- [ ] **Claude ported file-by-file** — `args.ts` (buildArgs), `decode.ts` (decode), `history.ts` (transcriptPath + parseHistory), `system-prompt.ts` (CHAT_SYSTEM_PROMPT) each have a test; the old inline copies in `@devgent/core` are deleted (no duplication). Capabilities `{resume:true, permissionGate:'hook', transcriptHistory:true, systemPrompt:'file'}`.
- [ ] **buildArgs gate test** — asserts the PreToolUse `--settings` hook is present **only** when `permissionUrl` is supplied (which core supplies only for `permissionGate:'hook'`), and absent otherwise.
- [ ] **decode test** — sample claude stream-json NDJSON → correct RUN_STARTED → TEXT/REASONING/TOOL_CALL → RUN_FINISHED sequence; `onSessionId` fires; bad lines skipped.
- [ ] **parseHistory test** — internal markers (`VIBE_PROGRESS_TICK`, `NEEDS_INFO:`, `<system-reminder>`) filtered; tool_use → tool-call parts.
- [ ] **codex** — Task 5 research gate verified the exact `exec` JSON flag + event schema + capability `?`s BEFORE coding decode; capabilities `{resume:?, permissionGate:'none', transcriptHistory:?, systemPrompt:'flag'}` recorded with the confirmed values; args + decode tested against captured real fixtures.
- [ ] **Stubs** — gemini-cli / opencode / pi declare capabilities and throw "not implemented"; registered so `listHarnesses` advertises them.
- [ ] **Core feature-detection** — `getHarness(config.harness ?? 'claude')`; `/permission` wired only when `permissionGate==='hook'`; `permissionUrl` set on the turn only then; `/history` wired only when `transcriptHistory` && both methods present; `systemPrompt==='none'` prepends to the first prompt, `'file'` writes a temp file, `'flag'` passes raw text. The claude (hook) IT still passes unchanged.
- [ ] **Generic fixture + IT** — `fake-harness.ts` replaces `fake-claude.ts`, format-selectable; an IT proves a `permissionGate:'none'` harness skips the approval gate cleanly (no `--settings`, `/permission` 404).
- [ ] **Capability matrix** — asserts `transcriptHistory ⇒ transcriptPath && parseHistory` defined (and absent when false) for every non-stub adapter; demonstrated RED by removing claude's `parseHistory`. Note this invariant is enforced TWICE: at definition time by `defineHarness` (throws on import) and at test time by the matrix.
- [ ] **Constraint A — every adapter via `defineHarness`** — `claude`, `codex`, and the `gemini-cli`/`opencode`/`pi` stubs are each `export const x = defineHarness({…})`, never a bare object literal; the in-test synthetic adapters (`stub()` in registry.test, `noGateAdapter()` in chat-route.it) also go through `defineHarness`. Every adapter file imports `defineHarness` from `@devgent/protocol/harness-types`. claude's `transcriptHistory` stays `false` in the intermediate Task 2/3 forms and flips to `true` only in Task 4 alongside `transcriptPath`+`parseHistory`, so `defineHarness`'s module-load invariant never throws mid-port.
- [ ] **Constraint B — zero type casting** — no `as` (except `as const`) and no angle-bracket casts in ANY code sample. Untrusted JSON is parsed into an annotated `const v: unknown = JSON.parse(...)` and narrowed via `isRecord`; `e.message.content` is read through a guarded `messageContent()` helper, not `(e.message as {content?: unknown})`; claude/codex `decode` and `parseHistory` narrow by discriminated `type` switch + `typeof` guards; test field reads use `isRecord`/`strField` guards instead of `as {delta: string}`. Verify with `grep -nE '\) as [A-Za-z{]|as \{|as string|as Record|as unknown' <plan>` returning nothing (allowing `as const`).
- [ ] **Conventions** — ESM, Node22, `verbatimModuleSyntax` (`import type` everywhere types are imported), functions-not-classes, no IIFEs (old inline-IIFE JSON parsers converted to named `parseLine`), no `index.ts`.
- [ ] **Hygiene** — each task RED→GREEN→commit; committed straight to `main`; every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; repo-wide `pnpm build && typecheck && test && lint` green.
