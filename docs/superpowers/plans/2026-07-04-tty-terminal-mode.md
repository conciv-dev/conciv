# TTY Terminal Mode Implementation Plan

> **Superseded by** `../specs/2026-07-04-terminal-extension-design.md` + `2026-07-04-terminal-extension.md` (v2) — executed through Task 7; the remaining work landed via the v2 plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Header toggle in the widget chat panel that switches between the structured chat view and a live terminal streaming the exact TTY bytes of the harness CLI (claude first), same conversation across the toggle.

**Architecture:** A harness adapter describes its TTY command (`tty.command`); core runs it under node-pty and bridges bytes over one WebSocket (binary = pty bytes both directions, JSON text frames = control); a new `@conciv/ui-kit-terminal` package renders it with xterm.js as compound Solid components; the widget wires a mode toggle. Rehydration after terminal use = re-fetch the existing `GET /api/chat/history` endpoint.

**Tech Stack:** node-pty (core), @xterm/xterm + @xterm/addon-fit (ui-kit-terminal), crossws (already wired via `attachWebSocket`), Solid, zod.

**Spec:** `docs/superpowers/specs/2026-07-04-tty-terminal-mode-design.md`. **Visual contract:** `docs/superpowers/specs/assets/2026-07-04-tty-terminal-mode-mockup.html` — final UI must match it.

## Spec amendments discovered during planning

Apply these to the spec file in Task 8; they simplify without changing behavior:

1. **Rehydration**: `GET /api/chat/history` already parses the full claude transcript via `harness.history.parse` (`packages/core/src/api/chat/session.ts:170-176`). No high-water mark, no new decode path: on terminal→chat the widget re-fetches history and replaces its message list.
2. **Mode persistence**: in-memory in the core tty service (`Map<sessionId, mode>`), not the session store. Core restart kills ptys anyway, so every restart consistently lands back in chat mode.
3. **UI package**: terminal UI ships as a new `@conciv/ui-kit-terminal` package (compound primitives + styled wrappers, per repo convention), not widget-local and not inside ui-kit-chat — ui-kit-chat is chat-thread primitives; a terminal surface is a different domain and must be independently removable. User asked for hard encapsulation so the feature is easy to remove or modify.
4. **Both surfaces**: the toggle + view swap live inside `ChatPanel` (`packages/widget/src/chat/chat-panel.tsx`), the pane content shared by the main widget panel and every quick-terminal pane — terminal mode therefore works in the quick terminal too, with per-pane independent modes.
5. **Hooks for harnesses and extensions**: harnesses hook in via the adapter capability (`tty.command` + `release`) — any harness that implements it gets terminal mode with zero core changes. Extensions hook in via (a) an `ExtensionSurface` slot named `terminal-header` rendered above the terminal screen, and (b) the session mode being readable through `GET /api/chat/mode`.

## Global Constraints

- Functions only, no classes. Zero narration comments. No `else`, no non-null assertions, no `any`/casts. No barrel files (package entry `index.tsx` is the public API surface, internal imports go to source files).
- ui-kit packages: every component = unstyled primitive + thin styled wrapper. Views over context: `createXModel` + Provider + `useX`, compound sub-components.
- Tests: real browser via Playwright (no jsdom), no stubs/mocks (real pty, real WS, real bash/claude), assert observable behavior. No tests in example apps.
- Build/typecheck via turborepo: `pnpm turbo build --filter=<pkg>`, `pnpm turbo typecheck --filter=<pkg>`.
- Widget ITs use `browser.newPage()`, never `newContext()`. Rebuild core before widget ITs.
- Commit with pathspec (`git commit -- <paths>`), identity must be omridevk noreply (already configured). On prek lock race: run `oxfmt` manually then `git commit --no-verify -- <paths>`.
- New deps (user-approved): `node-pty` → `@conciv/core`; `@xterm/xterm`, `@xterm/addon-fit` → `@conciv/ui-kit-terminal`. No other new deps without asking.

---

### Task 1: Protocol terminal types + adapter capability fields

**Files:**

- Create: `packages/protocol/src/terminal-types.ts`
- Modify: `packages/protocol/src/harness-types.ts` (add `tty` + `release` to `HarnessAdapterBase`)
- Modify: `packages/protocol/package.json` (add `./terminal-types` export, mirroring the existing `./harness-types` entry)
- Test: `packages/protocol/test/terminal-types.test.ts`

**Interfaces:**

- Produces: `TtyCommand`, `TtyCommandOpts`, `TtyClientControlSchema`/`TtyClientControl`, `TtyServerControlSchema`/`TtyServerControl`, `SessionModeSchema`/`SessionMode`, `SetModeRequestSchema`/`SetModeResponse`; `HarnessAdapterBase.tty?: {command(opts: TtyCommandOpts): TtyCommand}` and `HarnessAdapterBase.release?: (sessionId: string) => void`

- [ ] **Step 1: Write the failing test**

```ts
// packages/protocol/test/terminal-types.test.ts
import {describe, expect, it} from 'vitest'
import {SessionModeSchema, TtyClientControlSchema, TtyServerControlSchema} from '../src/terminal-types.js'

describe('terminal types', () => {
  it('parses session modes', () => {
    expect(SessionModeSchema.parse('chat')).toBe('chat')
    expect(SessionModeSchema.parse('terminal')).toBe('terminal')
    expect(SessionModeSchema.safeParse('tty').success).toBe(false)
  })

  it('parses client control frames', () => {
    expect(TtyClientControlSchema.parse({type: 'resize', cols: 120, rows: 32})).toEqual({
      type: 'resize',
      cols: 120,
      rows: 32,
    })
    expect(TtyClientControlSchema.safeParse({type: 'resize', cols: 'x'}).success).toBe(false)
  })

  it('parses server control frames', () => {
    expect(TtyServerControlSchema.parse({type: 'exit', code: 0})).toEqual({type: 'exit', code: 0})
    expect(TtyServerControlSchema.parse({type: 'busy', busy: true})).toEqual({type: 'busy', busy: true})
    expect(TtyServerControlSchema.parse({type: 'error', message: 'boom'})).toEqual({type: 'error', message: 'boom'})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/protocol vitest run test/terminal-types.test.ts`
Expected: FAIL — cannot resolve `../src/terminal-types.js`

- [ ] **Step 3: Write the types**

```ts
// packages/protocol/src/terminal-types.ts
import {z} from 'zod'

export const SessionModeSchema = z.enum(['chat', 'terminal'])
export type SessionMode = z.infer<typeof SessionModeSchema>

export type TtyCommand = {bin: string; args: string[]; env: Record<string, string>}

export type TtyCommandOpts = {
  cwd: string
  harnessSessionId: string
  resume: boolean
  model?: string | null
}

export const TtyClientControlSchema = z.object({
  type: z.literal('resize'),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(500),
})
export type TtyClientControl = z.infer<typeof TtyClientControlSchema>

export const TtyServerControlSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('exit'), code: z.number()}),
  z.object({type: z.literal('busy'), busy: z.boolean()}),
  z.object({type: z.literal('error'), message: z.string()}),
])
export type TtyServerControl = z.infer<typeof TtyServerControlSchema>

export const SetModeRequestSchema = z.object({mode: SessionModeSchema})
export const SetModeResponseSchema = z.object({mode: SessionModeSchema})
export type SetModeResponse = z.infer<typeof SetModeResponseSchema>
```

In `packages/protocol/src/harness-types.ts`, extend `HarnessAdapterBase` (the type at the bottom of the file) with two optional fields, importing the types:

```ts
import type {TtyCommand, TtyCommandOpts} from './terminal-types.js'
```

```ts
  tty?: {command(opts: TtyCommandOpts): TtyCommand}
  release?: (sessionId: string) => void
```

In `packages/protocol/package.json`, add an export entry shaped exactly like the existing `./harness-types` one, pointing at `terminal-types`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/protocol vitest run test/terminal-types.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm turbo typecheck --filter=@conciv/protocol`
Expected: clean

```bash
git add packages/protocol/src/terminal-types.ts packages/protocol/src/harness-types.ts packages/protocol/package.json packages/protocol/test/terminal-types.test.ts
git commit -m "feat(protocol): terminal mode types + adapter tty/release capability" -- packages/protocol
```

---

### Task 2: Claude adapter — tty command builder + per-session release

**Files:**

- Create: `packages/harness/src/claude/tty.ts`
- Modify: `packages/harness/src/claude/sdk.ts` (export `claudeSdkRelease`)
- Modify: `packages/harness/src/claude/index.ts` (wire `tty` + `release` onto the adapter)
- Test: `packages/harness/test/claude-tty.test.ts` (follow the naming of existing tests in `packages/harness/test/`; if tests live elsewhere, colocate with them)

**Interfaces:**

- Consumes: `TtyCommand`, `TtyCommandOpts` from `@conciv/protocol/terminal-types`
- Produces: `claudeTtyCommand(opts: TtyCommandOpts): TtyCommand`; `claudeSdkRelease(sessionId: string): void`; `claude.tty` and `claude.release` populated

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/test/claude-tty.test.ts
import {describe, expect, it} from 'vitest'
import {claudeTtyCommand} from '../src/claude/tty.js'

describe('claudeTtyCommand', () => {
  it('resumes an existing session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true})
    expect(cmd.bin).toBe('claude')
    expect(cmd.args).toEqual(['--resume', 'abc-123'])
    expect(cmd.env.TERM).toBe('xterm-256color')
  })

  it('pins the session id for a fresh session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: false})
    expect(cmd.args).toEqual(['--session-id', 'abc-123'])
  })

  it('passes the model through', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true, model: 'opus'})
    expect(cmd.args).toEqual(['--resume', 'abc-123', '--model', 'opus'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/harness vitest run test/claude-tty.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/claude/tty.ts
import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'

export function claudeTtyCommand(opts: TtyCommandOpts): TtyCommand {
  const base = opts.resume ? ['--resume', opts.harnessSessionId] : ['--session-id', opts.harnessSessionId]
  const args = opts.model ? [...base, '--model', opts.model] : base
  return {bin: 'claude', args, env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'}}
}
```

In `packages/harness/src/claude/sdk.ts`, next to `claudeSdkShutdown`, add:

```ts
export function claudeSdkRelease(sessionId: string): void {
  evict(sessionId)
}
```

In `packages/harness/src/claude/index.ts`, add to the `claude` adapter object:

```ts
import {claudeTtyCommand} from './tty.js'
import {claudeSdkRelease} from './sdk.js'
```

```ts
  tty: {command: claudeTtyCommand},
  release: claudeSdkRelease,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/harness vitest run test/claude-tty.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm turbo typecheck --filter=@conciv/harness`
Expected: clean

```bash
git add packages/harness/src/claude/tty.ts packages/harness/src/claude/sdk.ts packages/harness/src/claude/index.ts packages/harness/test/claude-tty.test.ts
git commit -m "feat(harness): claude tty command descriptor + per-session release" -- packages/harness
```

---

### Task 3: Core — OSC 9;4 busy tracker

**Files:**

- Create: `packages/core/src/api/tty/osc-busy.ts`
- Test: `packages/core/test/api/tty-osc-busy.test.ts`

**Interfaces:**

- Produces: `createOscBusyTracker(): {feed(chunk: string): void; busy(): boolean; seen(): boolean; onChange(cb: (busy: boolean) => void): void}` — `seen()` is true once any OSC 9;4 sequence was observed (guard stays inactive on CLIs that never emit it)

Claude Code emits ConEmu progress sequences: `ESC ] 9 ; 4 ; <state> ; <progress> BEL` (also `ESC \` terminator). `state` `0` = clear (idle); any other state = busy. Sequences can be split across chunks — the tracker keeps a small carry buffer.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/api/tty-osc-busy.test.ts
import {describe, expect, it} from 'vitest'
import {createOscBusyTracker} from '../../src/api/tty/osc-busy.js'

const ESC = ''
const BEL = ''

describe('osc busy tracker', () => {
  it('is idle and unseen before any sequence', () => {
    const t = createOscBusyTracker()
    t.feed('plain output, no sequences')
    expect(t.busy()).toBe(false)
    expect(t.seen()).toBe(false)
  })

  it('flips busy on progress set and idle on clear', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4;3;${BEL}`)
    expect(t.busy()).toBe(true)
    expect(t.seen()).toBe(true)
    t.feed(`${ESC}]9;4;0;${BEL}`)
    expect(t.busy()).toBe(false)
  })

  it('handles a sequence split across chunks', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4`)
    t.feed(`;1;50${BEL}`)
    expect(t.busy()).toBe(true)
  })

  it('accepts the ST terminator', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4;1;${ESC}\\`)
    expect(t.busy()).toBe(true)
  })

  it('notifies on change only', () => {
    const t = createOscBusyTracker()
    const states: boolean[] = []
    t.onChange((b) => states.push(b))
    t.feed(`${ESC}]9;4;1;${BEL}`)
    t.feed(`${ESC}]9;4;2;${BEL}`)
    t.feed(`${ESC}]9;4;0;${BEL}`)
    expect(states).toEqual([true, false])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-osc-busy.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// packages/core/src/api/tty/osc-busy.ts
const SEQUENCE = /\]9;4;(\d+)[^]*(?:|\\)/g
const CARRY_MAX = 64

export type OscBusyTracker = {
  feed(chunk: string): void
  busy(): boolean
  seen(): boolean
  onChange(cb: (busy: boolean) => void): void
}

export function createOscBusyTracker(): OscBusyTracker {
  const state = {carry: '', busy: false, seen: false}
  const listeners: ((busy: boolean) => void)[] = []

  const set = (busy: boolean): void => {
    state.seen = true
    if (busy === state.busy) return
    state.busy = busy
    for (const cb of listeners) cb(busy)
  }

  const feed = (chunk: string): void => {
    const text = state.carry + chunk
    for (const match of text.matchAll(SEQUENCE)) set(match[1] !== '0')
    const tail = text.lastIndexOf('')
    state.carry = tail >= 0 && text.length - tail <= CARRY_MAX ? text.slice(tail) : ''
  }

  return {
    feed,
    busy: () => state.busy,
    seen: () => state.seen,
    onChange: (cb) => listeners.push(cb),
  }
}
```

Note the carry logic: everything from the last `ESC` onward is kept (capped) so a sequence split across chunks reassembles; a fully matched sequence still ends before any trailing `ESC`, so matched text is never re-fed. If the trailing `ESC` carry causes a double-count edge in testing (a matched sequence ending in `ESC \` leaves its own `ESC` behind), fix by tracking the end index of the last match and only carrying text after it — the test in Step 1 must stay green.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-osc-busy.test.ts`
Expected: PASS (if the split/ST tests fail, apply the end-index fix from Step 3's note)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/tty/osc-busy.ts packages/core/test/api/tty-osc-busy.test.ts
git commit -m "feat(core): osc 9;4 busy tracker for tty mode" -- packages/core
```

---

### Task 4: Core — pty session service (node-pty)

**Files:**

- Modify: `packages/core/package.json` (add `node-pty`)
- Create: `packages/core/src/api/tty/pty-sessions.ts`
- Test: `packages/core/test/api/tty-pty-sessions.it.test.ts`

**Interfaces:**

- Consumes: `TtyCommand` from `@conciv/protocol/terminal-types`, `createOscBusyTracker` from Task 3
- Produces:

```ts
type TtySink = {data(chunk: string): void; control(frame: TtyServerControl): void}
type TtySession = {
  write(data: string): void
  resize(cols: number, rows: number): void
  attach(sink: TtySink): () => void      // returns detach; replay is flushed to sink.data before live bytes
  busy(): boolean
  kill(): void
  exited(): {code: number} | null
}
type TtySessions = {
  open(sessionId: string, command: TtyCommand, cwd: string): TtySession
  get(sessionId: string): TtySession | undefined
  close(sessionId: string): void
  shutdown(): void
}
createTtySessions(opts?: {idleEvictMs?: number; replayCap?: number}): TtySessions
```

- [ ] **Step 1: Install node-pty**

```bash
pnpm --filter @conciv/core add node-pty
```

Expected: installs with prebuilt binding (no gyp errors on macOS arm64/x64).

- [ ] **Step 2: Write the failing IT**

```ts
// packages/core/test/api/tty-pty-sessions.it.test.ts
import {afterEach, describe, expect, it} from 'vitest'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySessions} from '../../src/api/tty/pty-sessions.js'

const BASH = {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}

function collect(): {
  chunks: string[]
  controls: TtyServerControl[]
  sink: {data(c: string): void; control(f: TtyServerControl): void}
} {
  const chunks: string[] = []
  const controls: TtyServerControl[] = []
  return {chunks, controls, sink: {data: (c) => chunks.push(c), control: (f) => controls.push(f)}}
}

const until = async (cond: () => boolean, ms = 5000): Promise<void> => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('pty sessions', () => {
  let sessions: TtySessions

  afterEach(() => sessions?.shutdown())

  it('streams output and echoes input through a real pty', async () => {
    sessions = createTtySessions()
    const s = sessions.open('s1', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.write('echo tty-roundtrip-$((40+2))\r')
    await until(() => chunks.join('').includes('tty-roundtrip-42'))
  })

  it('replays buffered bytes to a late attacher', async () => {
    sessions = createTtySessions()
    const s = sessions.open('s2', BASH, process.cwd())
    const early = collect()
    const detach = s.attach(early.sink)
    s.write('echo replay-marker\r')
    await until(() => early.chunks.join('').includes('replay-marker'))
    detach()
    const late = collect()
    s.attach(late.sink)
    expect(late.chunks.join('')).toContain('replay-marker')
  })

  it('applies resize', async () => {
    sessions = createTtySessions()
    const s = sessions.open('s3', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.resize(97, 41)
    s.write('stty size\r')
    await until(() => chunks.join('').includes('41 97'))
  })

  it('reports exit to sinks and via exited()', async () => {
    sessions = createTtySessions()
    const s = sessions.open('s4', BASH, process.cwd())
    const {controls, sink} = collect()
    s.attach(sink)
    s.write('exit 3\r')
    await until(() => s.exited() !== null)
    expect(s.exited()).toEqual({code: 3})
    expect(controls.some((f) => f.type === 'exit' && f.code === 3)).toBe(true)
  })

  it('evicts an idle session with no sinks', async () => {
    sessions = createTtySessions({idleEvictMs: 100})
    const s = sessions.open('s5', BASH, process.cwd())
    const detach = s.attach(collect().sink)
    detach()
    await until(() => sessions.get('s5') === undefined, 3000)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-pty-sessions.it.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

```ts
// packages/core/src/api/tty/pty-sessions.ts
import {spawn, type IPty} from 'node-pty'
import type {TtyCommand, TtyServerControl} from '@conciv/protocol/terminal-types'
import {createOscBusyTracker, type OscBusyTracker} from './osc-busy.js'

const IDLE_EVICT_MS = 5 * 60 * 1000
const REPLAY_CAP = 4 * 1024 * 1024
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

export type TtySink = {data(chunk: string): void; control(frame: TtyServerControl): void}

export type TtySession = {
  write(data: string): void
  resize(cols: number, rows: number): void
  attach(sink: TtySink): () => void
  busy(): boolean
  kill(): void
  exited(): {code: number} | null
}

export type TtySessions = {
  open(sessionId: string, command: TtyCommand, cwd: string): TtySession
  get(sessionId: string): TtySession | undefined
  close(sessionId: string): void
  shutdown(): void
}

type Entry = {
  pty: IPty
  session: TtySession
  replay: string[]
  replaySize: number
  sinks: Set<TtySink>
  tracker: OscBusyTracker
  exit: {code: number} | null
  idle: ReturnType<typeof setTimeout> | null
}

export function createTtySessions(opts?: {idleEvictMs?: number; replayCap?: number}): TtySessions {
  const idleEvictMs = opts?.idleEvictMs ?? IDLE_EVICT_MS
  const replayCap = opts?.replayCap ?? REPLAY_CAP
  const entries = new Map<string, Entry>()

  const drop = (sessionId: string): void => {
    const entry = entries.get(sessionId)
    if (!entry) return
    entries.delete(sessionId)
    if (entry.idle) clearTimeout(entry.idle)
    if (!entry.exit) entry.pty.kill()
  }

  const armIdle = (sessionId: string, entry: Entry): void => {
    if (entry.idle) clearTimeout(entry.idle)
    if (entry.sinks.size > 0) {
      entry.idle = null
      return
    }
    entry.idle = setTimeout(() => {
      if (entry.sinks.size === 0 && !entry.tracker.busy()) drop(sessionId)
    }, idleEvictMs)
    entry.idle.unref?.()
  }

  const record = (entry: Entry, chunk: string): void => {
    entry.replay.push(chunk)
    entry.replaySize += chunk.length
    while (entry.replaySize > replayCap && entry.replay.length > 1) {
      const head = entry.replay.shift()
      if (head) entry.replaySize -= head.length
    }
  }

  const open = (sessionId: string, command: TtyCommand, cwd: string): TtySession => {
    drop(sessionId)
    const pty = spawn(command.bin, command.args, {
      name: 'xterm-256color',
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cwd,
      env: {...process.env, ...command.env},
    })
    const partial = {
      pty,
      replay: [],
      replaySize: 0,
      sinks: new Set<TtySink>(),
      tracker: createOscBusyTracker(),
      exit: null,
      idle: null,
    }

    const session: TtySession = {
      write: (data) => {
        if (!entry.exit) entry.pty.write(data)
      },
      resize: (cols, rows) => {
        if (!entry.exit) entry.pty.resize(cols, rows)
      },
      attach: (sink) => {
        for (const chunk of entry.replay) sink.data(chunk)
        if (entry.exit) sink.control({type: 'exit', code: entry.exit.code})
        entry.sinks.add(sink)
        armIdle(sessionId, entry)
        return () => {
          entry.sinks.delete(sink)
          armIdle(sessionId, entry)
        }
      },
      busy: () => entry.tracker.busy(),
      kill: () => drop(sessionId),
      exited: () => entry.exit,
    }
    const entry: Entry = {...partial, session}
    entries.set(sessionId, entry)

    entry.tracker.onChange((busy) => {
      for (const sink of entry.sinks) sink.control({type: 'busy', busy})
    })
    pty.onData((chunk) => {
      entry.tracker.feed(chunk)
      record(entry, chunk)
      for (const sink of entry.sinks) sink.data(chunk)
    })
    pty.onExit(({exitCode}) => {
      entry.exit = {code: exitCode}
      for (const sink of entry.sinks) sink.control({type: 'exit', code: exitCode})
    })
    return session
  }

  return {
    open,
    get: (sessionId) => entries.get(sessionId)?.session,
    close: drop,
    shutdown: () => {
      for (const id of [...entries.keys()]) drop(id)
    },
  }
}
```

Ordering note: the `session` closure references `entry`, which is created right after from `partial` — declare `let entry: Entry` above the facade if TS complains about use-before-assign (the callbacks only run after `entries.set`). Final code: one facade per entry, no duplicated construction, no `else`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-pty-sessions.it.test.ts`
Expected: PASS (all five)

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm turbo typecheck --filter=@conciv/core`
Expected: clean

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/api/tty/pty-sessions.ts packages/core/test/api/tty-pty-sessions.it.test.ts
git commit -m "feat(core): pty session service on node-pty (replay, resize, busy, idle evict)" -- packages/core pnpm-lock.yaml
```

---

### Task 5: Core — tty WS route + mode endpoint

**Files:**

- Create: `packages/core/src/api/tty/tty.ts`
- Modify: `packages/core/src/app.ts` (register + dispose)
- Test: `packages/core/test/api/tty-routes.it.test.ts`

**Interfaces:**

- Consumes: `createTtySessions` (Task 4), adapter `tty.command` + `release` (Tasks 1-2), `resumeTokenFor`/`recordMintedToken` from `packages/core/src/api/chat/turn.ts:17-19`, `readLock` from `packages/core/src/store/lock.ts`, `sessionIdFromHeaders` from `packages/core/src/api/chat/session-id.ts`, crossws `Response.crossws` contract from `packages/core/src/api/ws.ts`
- Produces:
  - `registerTtyRoutes(app: H3, deps: TtyRouteDeps): {dispose(): void}`
  - `GET /api/tty?session=<conciv-session-id>&cols=<n>&rows=<n>` — WebSocket upgrade. Down: binary frames = pty bytes (replay first), text frames = `TtyServerControl` JSON. Up: binary/text non-JSON-control frames = keystrokes, text frames parsing as `TtyClientControl` = resize.
  - `POST /api/chat/mode` (session id via `x-conciv-session` header like other chat routes) body `{mode}` → `{mode}`; 409 when busy, 400 when adapter lacks `tty`.
  - `GET /api/chat/mode` → `{mode}` (defaults to `chat`).

Behavior:

- `mode: terminal`: reject 409 if the chat lock is held (`readLock(stateRoot, sessionId).held`). Resolve harness session id: `await resumeTokenFor(store, sessionId)`; when null, mint `randomUUID()` and `await recordMintedToken(store, sessionId, minted)`. Call `harness.release?.(sessionId)` to evict the SDK warm session. `ttySessions.open(sessionId, harness.tty.command({cwd, harnessSessionId, resume: hadToken, model: record?.model}), cwd)`. Set in-memory mode map.
- `mode: chat`: reject 409 if `ttySessions.get(sessionId)?.busy()`. `ttySessions.close(sessionId)`. Set mode map.
- WS `open`: look up the session by the `session` query param; missing session or mode !== terminal → close with code 4404. Attach a sink: `sink.data` sends `Buffer.from(chunk)` (binary), `sink.control` sends `JSON.stringify(frame)` (text). Apply `cols/rows` query params via `session.resize` when present.
- WS `message`: text that parses as `TtyClientControlSchema` → resize; anything the schema rejects → `session.write(message.text())`; binary → `session.write(new TextDecoder().decode(message.uint8Array()))`.
- WS `close`: detach the sink.
- `dispose()` → `ttySessions.shutdown()`; app.ts pushes it onto `disposers`.

- [ ] **Step 1: Write the failing IT**

The test boots a real `H3` app + real HTTP server with `attachWebSocket`, using a fake-but-real adapter whose `tty.command` returns bash (a real command — the adapter descriptor is data, not behavior, so this respects the no-mocks rule while keeping the IT claude-free and fast). Follow the server-boot pattern of an existing IT in `packages/core/test/api/` (e.g. `extension-app.it.test.ts`) for how the app/server/store are constructed in tests; reuse its helpers rather than inventing new ones.

```ts
// packages/core/test/api/tty-routes.it.test.ts — core assertions (adapt boot helpers from extension-app.it.test.ts)
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

// boot: makeApp(...) with a test adapter:
//   {...claude adapter shape, id: 'test-tty', capabilities: {...resume: true},
//    tty: {command: () => ({bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}})},
//    release: () => {}}
// then srvx serve + attachWebSocket, base = http://127.0.0.1:<port>

describe('tty routes', () => {
  it('mode defaults to chat', async () => {
    const res = await fetch(`${base}/api/chat/mode`, {headers: sessionHeaders})
    expect(await res.json()).toEqual({mode: 'chat'})
  })

  it('switches to terminal and streams pty bytes over ws', async () => {
    const set = await fetch(`${base}/api/chat/mode`, {
      method: 'POST',
      headers: {...sessionHeaders, 'content-type': 'application/json'},
      body: JSON.stringify({mode: 'terminal'}),
    })
    expect(set.status).toBe(200)

    const ws = new WebSocket(`${wsBase}/api/tty?session=${sessionId}&cols=100&rows=30`)
    const received: string[] = []
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') received.push(new TextDecoder().decode(event.data as ArrayBuffer))
    })
    ws.binaryType = 'arraybuffer'
    await new Promise((resolve) => ws.addEventListener('open', resolve))
    ws.send('echo ws-roundtrip-$((40+2))\r')
    await until(() => received.join('').includes('ws-roundtrip-42'))

    ws.send(JSON.stringify({type: 'resize', cols: 91, rows: 27}))
    ws.send('stty size\r')
    await until(() => received.join('').includes('27 91'))
    ws.close()
  })

  it('replays on reconnect', async () => {
    const ws = new WebSocket(`${wsBase}/api/tty?session=${sessionId}`)
    ws.binaryType = 'arraybuffer'
    const received: string[] = []
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') received.push(new TextDecoder().decode(event.data as ArrayBuffer))
    })
    await until(() => received.join('').includes('ws-roundtrip-42'))
    ws.close()
  })

  it('rejects ws for a session not in terminal mode', async () => {
    const other = await resolveFreshSession()
    const ws = new WebSocket(`${wsBase}/api/tty?session=${other}`)
    const closed = await new Promise<CloseEvent>((resolve) => ws.addEventListener('close', resolve))
    expect(closed.code).toBe(4404)
  })

  it('returns to chat mode and kills the pty', async () => {
    const set = await fetch(`${base}/api/chat/mode`, {
      method: 'POST',
      headers: {...sessionHeaders, 'content-type': 'application/json'},
      body: JSON.stringify({mode: 'chat'}),
    })
    expect(set.status).toBe(200)
    const res = await fetch(`${base}/api/chat/mode`, {headers: sessionHeaders})
    expect(await res.json()).toEqual({mode: 'chat'})
  })
})
```

Include a busy-rejection case: acquire the chat lock directly via `acquireLock(stateRoot, sessionId, 'chat', process.pid)` from `packages/core/src/store/lock.ts`, POST `{mode:'terminal'}`, expect 409, release with `releaseLock`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-routes.it.test.ts`
Expected: FAIL — `registerTtyRoutes` missing

- [ ] **Step 3: Implement the routes**

```ts
// packages/core/src/api/tty/tty.ts
import {randomUUID} from 'node:crypto'
import {type H3, HTTPError, readValidatedBody} from 'h3'
import type {Hooks, Peer} from 'crossws'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {SetModeRequestSchema, TtyClientControlSchema, type SessionMode} from '@conciv/protocol/terminal-types'
import type {SessionStore} from '../../store/session-store.js'
import {readLock} from '../../store/lock.js'
import {sessionIdFromHeaders} from '../chat/session-id.js'
import {resumeTokenFor, recordMintedToken} from '../chat/turn.js'
import {createTtySessions, type TtySink} from './pty-sessions.js'

export type TtyRouteDeps = {
  cwd: string
  stateRoot: string
  harness: HarnessAdapter
  store: SessionStore
}

export function registerTtyRoutes(app: H3, deps: TtyRouteDeps): {dispose(): void} {
  const ttySessions = createTtySessions()
  const modes = new Map<string, SessionMode>()

  const requireSession = (headers: Headers): string => {
    const sessionId = sessionIdFromHeaders(headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
    return sessionId
  }

  app.get('/api/chat/mode', (event) => ({mode: modes.get(requireSession(event.req.headers)) ?? 'chat'}))

  app.post('/api/chat/mode', async (event) => {
    const sessionId = requireSession(event.req.headers)
    const {mode} = await readValidatedBody(event, SetModeRequestSchema)

    if (mode === 'terminal') {
      const tty = deps.harness.tty
      if (!tty) throw new HTTPError({status: 400, message: `harness "${deps.harness.id}" has no terminal mode`})
      if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
      const existing = await resumeTokenFor(deps.store, sessionId)
      const harnessSessionId = existing ?? randomUUID()
      if (!existing) await recordMintedToken(deps.store, sessionId, harnessSessionId)
      const record = await deps.store.get(sessionId)
      deps.harness.release?.(sessionId)
      ttySessions.open(
        sessionId,
        tty.command({cwd: deps.cwd, harnessSessionId, resume: Boolean(existing), model: record?.model}),
        deps.cwd,
      )
      modes.set(sessionId, 'terminal')
      return {mode}
    }

    if (ttySessions.get(sessionId)?.busy()) throw new HTTPError({status: 409, message: 'terminal busy'})
    ttySessions.close(sessionId)
    modes.set(sessionId, 'chat')
    return {mode}
  })

  app.get('/api/tty', (event) => {
    const url = new URL(event.req.url)
    const sessionId = url.searchParams.get('session') ?? ''
    const cols = Number(url.searchParams.get('cols'))
    const rows = Number(url.searchParams.get('rows'))
    const detachRef: {detach: (() => void) | null} = {detach: null}

    const hooks: Partial<Hooks> = {
      open(peer: Peer) {
        const session = modes.get(sessionId) === 'terminal' ? ttySessions.get(sessionId) : undefined
        if (!session) {
          peer.close(4404, 'no terminal for session')
          return
        }
        if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 1 && rows > 1) session.resize(cols, rows)
        const sink: TtySink = {
          data: (chunk) => peer.send(Buffer.from(chunk), {compress: false}),
          control: (frame) => peer.send(JSON.stringify(frame)),
        }
        detachRef.detach = session.attach(sink)
      },
      message(_peer: Peer, message) {
        const session = ttySessions.get(sessionId)
        if (!session) return
        const text = message.text()
        const control = (() => {
          try {
            return TtyClientControlSchema.safeParse(JSON.parse(text))
          } catch {
            return {success: false as const}
          }
        })()
        if (control.success) {
          session.resize(control.data.cols, control.data.rows)
          return
        }
        session.write(text)
      },
      close() {
        detachRef.detach?.()
        detachRef.detach = null
      },
    }
    const res = new Response(null)
    res.crossws = hooks
    return res
  })

  return {dispose: () => ttySessions.shutdown()}
}
```

Notes for the implementer:

- `Response.crossws` is the contract `attachWebSocket` resolves hooks through (`packages/core/src/api/ws.ts` declares the global). Origin checking already happens in the upgrade hook there.
- crossws `message.text()` decodes binary frames too, and keystrokes are utf-8 text either way, so a single `text()` path handles both frame kinds; do NOT double-write by also handling `uint8Array()`.
- One WS per session is the supported shape; multiple sockets attach fine (each gets replay) with last-resize-wins.
- If `resumeTokenFor`/`recordMintedToken` importing from `turn.ts` creates a cycle, move both helpers to a new `packages/core/src/api/chat/resume.ts` and update `turn.ts` imports — keep them single-sourced.

In `packages/core/src/app.ts`: import `registerTtyRoutes`, call it after `registerChatRoutes` with `{cwd: opts.cwd, stateRoot: opts.cfg.stateRoot, harness, store}` — `registerChatRoutes` currently creates the store internally, so lift `createFsSessionStore({stateRoot: opts.cfg.stateRoot})` up into `makeApp`, pass it into both (add a `store` field to `ChatRouteOpts` and use it instead of the internal create). Push the returned `dispose` onto `disposers`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @conciv/core vitest run test/api/tty-routes.it.test.ts test/api/tty-pty-sessions.it.test.ts`
Expected: PASS

Run the full core suite for regressions (store lift touches chat routes): `pnpm --filter @conciv/core test`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm turbo typecheck --filter=@conciv/core`
Expected: clean

```bash
git add packages/core/src/api/tty/tty.ts packages/core/src/app.ts packages/core/src/api/chat/chat.ts packages/core/test/api/tty-routes.it.test.ts
git commit -m "feat(core): tty websocket route + session mode endpoint" -- packages/core
```

---

### Task 6: New package — @conciv/ui-kit-terminal

**Files:**

- Create: `packages/ui-kit-terminal/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `vitest.config.ts` — copy each from `packages/ui-kit-chat` and strip to essentials (no storybook v0; keep vitest browser-playwright)
- Create: `packages/ui-kit-terminal/src/model.ts`
- Create: `packages/ui-kit-terminal/src/primitives/terminal.tsx`
- Create: `packages/ui-kit-terminal/src/styled/terminal.tsx`
- Create: `packages/ui-kit-terminal/src/index.tsx`
- Test: `packages/ui-kit-terminal/test/terminal.test.tsx` (vitest browser mode, real Chromium)

**Interfaces:**

- Consumes: `TtyClientControl`, `TtyServerControlSchema` from `@conciv/protocol/terminal-types`
- Produces (package public API via `src/index.tsx`):

```ts
createTerminalModel(opts: TerminalModelOpts): TerminalModel
type TerminalModelOpts = {
  url: () => string                    // ws(s) url including session/cols/rows params
  theme?: () => TerminalTheme          // xterm ITheme subset; re-run on change
  fontSize?: number
}
type TerminalStatus = 'idle' | 'connecting' | 'open' | 'exited' | 'error'
type TerminalModel = {
  terminal: XtermTerminal              // the real xterm instance (test + advanced surface)
  status: () => TerminalStatus         // solid signal accessors
  busy: () => boolean
  exitCode: () => number | null
  errorMessage: () => string | null
  connect(): void
  disconnect(): void
  fit(): void
}
// compound components
TerminalPrimitive.Root(props: {model: TerminalModel; children})   // context provider, plain div wrapper
TerminalPrimitive.Screen(props: {class?})                          // mounts xterm, ResizeObserver -> fit -> resize frame
TerminalPrimitive.Banner(props: {children: (state: {code: number | null; message: string | null}) => JSX})  // renders only when exited/error
useTerminal(): TerminalModel
// styled
Terminal(props: {model: TerminalModel; onBackToChat?: () => void; class?})  // full-bleed screen + mockup-styled banner
```

Model behavior:

- `connect()`: `new WebSocket(url())`, `binaryType = 'arraybuffer'`; status `connecting` → `open`. Binary message → `terminal.write(new Uint8Array(data))`. Text message → `TtyServerControlSchema` parse: `exit` → status `exited` + exitCode; `busy` → busy signal; `error` → status `error` + message.
- `terminal.onData` → `socket.send(data)` when socket open.
- `fit()`: FitAddon fit, then send `{type:'resize', cols, rows}` when open.
- Socket close while status `open` → back to `connecting` and retry with 1s delay (skip retry after `exited`/`error`/`disconnect()`).
- All xterm construction inside the model: `new Terminal({convertEol: false, scrollback: 5000, fontSize: opts.fontSize ?? 13, theme: opts.theme?.()})`; `loadAddon(new FitAddon())`.
- **Solid gotchas (from memory):** no writes during render — `connect()` is called from `onMount`/handlers only; capture `useTerminal()` result in render scope, never inline in event handlers.

`TerminalPrimitive.Screen` mount detail (shadow-DOM encapsulation): on mount, find `element.getRootNode()`; if it is a `ShadowRoot` and lacks `style[data-conciv-xterm]`, create a style tag with the xterm css text (`import xtermCss from '@xterm/xterm/css/xterm.css?inline'`) and append it to that root; same check-and-inject against `document.head` when the root is the document. Then `model.terminal.open(element)` and `model.connect()`, `model.fit()` after open; ResizeObserver on the element calls `model.fit()`. onCleanup: disconnect observer + `model.disconnect()`.

- [ ] **Step 1: Scaffold the package**

Copy configs from ui-kit-chat, then:

```jsonc
// packages/ui-kit-terminal/package.json — key fields (rest mirrors ui-kit-chat)
{
  "name": "@conciv/ui-kit-terminal",
  "version": "0.0.1",
  "description": "Compound SolidJS terminal components (xterm.js) for conciv tty mode: headless primitives plus a styled terminal surface.",
  "type": "module",
  "exports": {".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}},
  "dependencies": {
    "@conciv/protocol": "workspace:^",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/xterm": "^5.5.0",
    "zod": "^4.4.3",
  },
  "peerDependencies": {"solid-js": "^1.9.13"},
}
```

```bash
pnpm install
pnpm turbo build --filter=@conciv/ui-kit-terminal
```

Expected: empty-ish build passes once `src/index.tsx` exists (stub export is fine for this step).

- [ ] **Step 2: Write the failing component test**

```tsx
// packages/ui-kit-terminal/test/terminal.test.tsx
import {describe, expect, it} from 'vitest'
import {render} from 'solid-js/web'
import {createTerminalModel} from '../src/model.js'
import {TerminalPrimitive} from '../src/primitives/terminal.js'

const flush = () => new Promise((r) => setTimeout(r, 50))

function mount(ui: () => ReturnType<typeof TerminalPrimitive.Root>): {host: HTMLElement; dispose: () => void} {
  const host = document.createElement('div')
  host.style.width = '640px'
  host.style.height = '320px'
  document.body.appendChild(host)
  const dispose = render(ui, host)
  return {host, dispose}
}

const bufferText = (model: ReturnType<typeof createTerminalModel>): string => {
  const buffer = model.terminal.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  return lines.join('\n')
}

describe('terminal primitives', () => {
  it('mounts xterm and renders written bytes', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
      </TerminalPrimitive.Root>
    ))
    await flush()
    model.terminal.write('[31mhello-term[0m')
    await flush()
    expect(bufferText(model)).toContain('hello-term')
    dispose()
  })

  it('shows the banner only after exit', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {host, dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
        <TerminalPrimitive.Banner>{(state) => <p>ended with {state.code}</p>}</TerminalPrimitive.Banner>
      </TerminalPrimitive.Root>
    ))
    await flush()
    expect(host.textContent ?? '').not.toContain('ended with')
    model.__testReceiveControl({type: 'exit', code: 0})
    await flush()
    expect(host.textContent ?? '').toContain('ended with 0')
    dispose()
  })
})
```

Add `__testReceiveControl(frame: TtyServerControl): void` to the model — the same function the socket text-message path calls, exposed so component tests exercise the real state machine without a server. The live WS loop is covered end-to-end by the widget IT (Task 8) and the core IT (Task 5).

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/ui-kit-terminal vitest run`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement model, primitives, styled**

```ts
// packages/ui-kit-terminal/src/model.ts
import {createSignal} from 'solid-js'
import {Terminal as Xterm, type ITheme} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {TtyServerControlSchema, type TtyServerControl} from '@conciv/protocol/terminal-types'

const RETRY_MS = 1000

export type TerminalTheme = ITheme
export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'exited' | 'error'

export type TerminalModelOpts = {
  url: () => string
  theme?: () => TerminalTheme
  fontSize?: number
}

export type TerminalModel = {
  terminal: Xterm
  status: () => TerminalStatus
  busy: () => boolean
  exitCode: () => number | null
  errorMessage: () => string | null
  connect(): void
  disconnect(): void
  fit(): void
  __testReceiveControl(frame: TtyServerControl): void
}

export function translateBuffer(terminal: Xterm): string {
  const buffer = terminal.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  return lines.join('\n')
}

export function createTerminalModel(opts: TerminalModelOpts): TerminalModel {
  const [status, setStatus] = createSignal<TerminalStatus>('idle')
  const [busy, setBusy] = createSignal(false)
  const [exitCode, setExitCode] = createSignal<number | null>(null)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)

  const terminal = new Xterm({
    convertEol: false,
    scrollback: 5000,
    fontSize: opts.fontSize ?? 13,
    theme: opts.theme?.(),
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  const state: {socket: WebSocket | null; retry: ReturnType<typeof setTimeout> | null; stopped: boolean} = {
    socket: null,
    retry: null,
    stopped: false,
  }

  const receiveControl = (frame: TtyServerControl): void => {
    if (frame.type === 'exit') {
      setExitCode(frame.code)
      setStatus('exited')
      return
    }
    if (frame.type === 'busy') {
      setBusy(frame.busy)
      return
    }
    setErrorMessage(frame.message)
    setStatus('error')
  }

  const sendResize = (): void => {
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({type: 'resize', cols: terminal.cols, rows: terminal.rows}))
    }
  }

  const connect = (): void => {
    if (state.socket || state.stopped) return
    setStatus('connecting')
    const socket = new WebSocket(opts.url())
    socket.binaryType = 'arraybuffer'
    state.socket = socket
    socket.addEventListener('open', () => {
      setStatus('open')
      sendResize()
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        terminal.write(new Uint8Array(event.data as ArrayBuffer))
        return
      }
      const parsed = TtyServerControlSchema.safeParse(JSON.parse(event.data))
      if (parsed.success) receiveControl(parsed.data)
    })
    socket.addEventListener('close', () => {
      state.socket = null
      const settled = status() === 'exited' || status() === 'error' || state.stopped
      if (settled) return
      setStatus('connecting')
      state.retry = setTimeout(connect, RETRY_MS)
    })
  }

  terminal.onData((data) => {
    if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(data)
  })

  return {
    terminal,
    status,
    busy,
    exitCode,
    errorMessage,
    connect,
    disconnect: () => {
      state.stopped = true
      if (state.retry) clearTimeout(state.retry)
      state.socket?.close()
      state.socket = null
      terminal.dispose()
    },
    fit: () => {
      fitAddon.fit()
      sendResize()
    },
    __testReceiveControl: receiveControl,
  }
}
```

Primitives:

```tsx
// packages/ui-kit-terminal/src/primitives/terminal.tsx — shape (full implementation per interface block)
import {createContext, onCleanup, onMount, Show, useContext, type JSX} from 'solid-js'
import xtermCss from '@xterm/xterm/css/xterm.css?inline'
import type {TerminalModel} from '../model.js'

const TerminalContext = createContext<TerminalModel>()

export function useTerminal(): TerminalModel {
  const model = useContext(TerminalContext)
  if (!model) throw new Error('useTerminal outside <TerminalPrimitive.Root>')
  return model
}

function Root(props: {model: TerminalModel; class?: string; children: JSX.Element}): JSX.Element {
  return (
    <TerminalContext.Provider value={props.model}>
      <div class={props.class} data-terminal-root>
        {props.children}
      </div>
    </TerminalContext.Provider>
  )
}

function injectCss(root: Node): void {
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-conciv-xterm]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-xterm', '')
  style.textContent = xtermCss
  target.appendChild(style)
}

function Screen(props: {class?: string}): JSX.Element {
  const model = useTerminal()
  let element: HTMLDivElement | undefined
  onMount(() => {
    if (!element) return
    injectCss(element.getRootNode())
    model.terminal.open(element)
    model.connect()
    model.fit()
    const observer = new ResizeObserver(() => model.fit())
    observer.observe(element)
    onCleanup(() => {
      observer.disconnect()
      model.disconnect()
    })
  })
  return <div ref={element} class={props.class} data-terminal-screen />
}

function Banner(props: {children: (state: {code: number | null; message: string | null}) => JSX.Element}): JSX.Element {
  const model = useTerminal()
  return (
    <Show when={model.status() === 'exited' || model.status() === 'error'}>
      {props.children({code: model.exitCode(), message: model.errorMessage()})}
    </Show>
  )
}

export const TerminalPrimitive = {Root, Screen, Banner}
```

Styled wrapper (`src/styled/terminal.tsx`): compose the primitives to match the mockup — Root fills the panel (`flex-1`, dark terminal background from theme tokens), Screen full-bleed with 10px padding, Banner styled as the mockup's "Terminal session ended" bar with a "Back to chat" button calling `props.onBackToChat`. Screen dims to 45% opacity when the banner is visible (drive via `data-` attribute on Root reflecting status; style with the package's classes, no arbitrary-prop pileups).

`src/index.tsx` exports exactly: `createTerminalModel`, types, `TerminalPrimitive`, `useTerminal`, `Terminal` (styled).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @conciv/ui-kit-terminal vitest run`
Expected: PASS (2)

- [ ] **Step 6: Build, typecheck, commit**

Run: `pnpm turbo build typecheck --filter=@conciv/ui-kit-terminal`
Expected: clean

```bash
git add packages/ui-kit-terminal pnpm-lock.yaml
git commit -m "feat(ui-kit-terminal): compound xterm terminal package (model, primitives, styled)" -- packages/ui-kit-terminal pnpm-lock.yaml
```

---

### Task 7: Widget integration — mode toggle + terminal view

**Files:**

- Modify: `packages/api-client/src/api-client.ts` (mode routes + tty url)
- Create: `packages/widget/src/chat/terminal-view.tsx`
- Create: `packages/widget/src/chat/mode-toggle.tsx`
- Modify: `packages/widget/src/chat/chat-panel.tsx` (toggle in header, mode-driven body swap — shared by main panel and quick-terminal panes)
- Modify: `packages/widget/package.json` (add `@conciv/ui-kit-terminal": "workspace:^`)
- Test: covered by Task 8's IT (UI wiring has no meaningful unit seam; the full loop is the observable behavior)

**Interfaces:**

- Consumes: `Terminal`, `createTerminalModel` from `@conciv/ui-kit-terminal`; `SetModeRequestSchema`/`SetModeResponseSchema` from protocol; pane `working()` signal in `quick-terminal.tsx`
- Produces: `client.mode` (GET), `client.setMode` (POST), `client.ttyUrl(cols, rows): string`; `<TerminalView client={...} onBackToChat={...}/>`; `<ModeToggle mode={...} busy={...} onChange={...}/>`

- [ ] **Step 1: api-client routes**

In `defineClient` (`packages/api-client/src/api-client.ts`), following the existing `t.route` pattern:

```ts
import {SetModeRequestSchema, SetModeResponseSchema} from '@conciv/protocol/terminal-types'
```

```ts
    mode: t.route({method: 'GET', path: '/api/chat/mode', response: SetModeResponseSchema}),
    setMode: t.route({
      method: 'POST',
      path: '/api/chat/mode',
      request: SetModeRequestSchema,
      response: SetModeResponseSchema,
    }),
    ttyUrl: (cols: number, rows: number) => {
      const id = sessionId()
      const http = t.url(`/api/tty?session=${id ?? ''}&cols=${cols}&rows=${rows}`)
      return http.replace(/^http/, 'ws')
    },
```

Run: `pnpm turbo typecheck --filter=@conciv/api-client` — clean. Commit:

```bash
git add packages/api-client/src/api-client.ts
git commit -m "feat(api-client): session mode + tty websocket url" -- packages/api-client
```

- [ ] **Step 2: TerminalView component**

```tsx
// packages/widget/src/chat/terminal-view.tsx
import {createEffect, type JSX} from 'solid-js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import type {SessionClient} from '@conciv/api-client'
import {ExtensionSurface} from '../extension/extension-slots.js'

function readTerminalTheme(element: Element): TerminalTheme {
  const tokens = getComputedStyle(element)
  const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback
  return {
    background: token('--pw-bg', '#101014'),
    foreground: token('--pw-text-hi', '#d6d6de'),
    cursor: token('--pw-text-hi', '#d6d6de'),
    selectionBackground: token('--pw-fill-strong', '#3a3a44'),
  }
}

export function TerminalView(props: {
  client: SessionClient
  onBusyChange: (busy: boolean) => void
  onBackToChat: () => void
}): JSX.Element {
  let host: HTMLDivElement | undefined
  const model = createTerminalModel({
    url: () => props.client.ttyUrl(120, 32),
    theme: () => readTerminalTheme(host ?? document.body),
  })
  createEffect(() => props.onBusyChange(model.busy()))
  return (
    <div ref={host} class="flex flex-col flex-1 min-h-0">
      <ExtensionSurface name="terminal-header" />
      <Terminal model={model} onBackToChat={props.onBackToChat} class="flex-1 min-h-0" />
    </div>
  )
}
```

`ExtensionSurface` requires the same host-bag props as its usages in `chat-panel.tsx` — copy the prop set from there (the snippet elides them). Widget-specific token knowledge (`--pw-*`) stays here, not in ui-kit-terminal.

- [ ] **Step 3: ModeToggle component**

```tsx
// packages/widget/src/chat/mode-toggle.tsx
import {type JSX} from 'solid-js'
import {MessageSquare, SquareTerminal} from 'lucide-solid'
import type {SessionMode} from '@conciv/protocol/terminal-types'

const SEG = 'inline-flex rounded-lg bg-pw-fill p-0.5 gap-0.5'
const BTN =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] text-pw-text-2 bg-transparent [border:none] cursor-pointer disabled:opacity-40 disabled:cursor-default'
const ON = 'bg-pw-fill-strong text-pw-text-hi'

export function ModeToggle(props: {
  mode: SessionMode
  busy: boolean
  onChange: (mode: SessionMode) => void
}): JSX.Element {
  const button = (mode: SessionMode, label: string, icon: JSX.Element): JSX.Element => (
    <button
      type="button"
      class={`${BTN} ${props.mode === mode ? ON : ''}`}
      disabled={props.busy || props.mode === mode}
      title={props.busy ? 'finishing current turn…' : undefined}
      aria-pressed={props.mode === mode}
      onClick={() => props.onChange(mode)}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div class={SEG} role="group" aria-label="View mode">
      {button('chat', 'Chat', <MessageSquare size={12} />)}
      {button('terminal', 'Terminal', <SquareTerminal size={12} />)}
    </div>
  )
}
```

Match class conventions to neighbors in the widget (`ACT` etc. in `chat-panel.tsx`); exact tokens verified against the mockup during Task 8's visual check.

- [ ] **Step 4: Wire into ChatPanel (covers main panel AND quick-terminal panes)**

Integration point is `packages/widget/src/chat/chat-panel.tsx` — `ChatPanel` is the shared pane content: `chatPanelDef` feeds the main widget panel (`mount.tsx` / `widget-shell.tsx`) and `QuickTerminalLayout` panes wrap the same component. Wiring here means terminal mode works in both surfaces with per-pane independent modes; do NOT touch `quick-terminal.tsx` unless its header composition needs a hole for the toggle.

Inside `ChatPanel`:

- Add `const [mode, setMode] = createSignal<SessionMode>('chat')` and `const [terminalBusy, setTerminalBusy] = createSignal(false)`.
- Render `<ModeToggle mode={mode()} busy={working() || terminalBusy()} onChange={switchMode}/>` in the panel's existing header/action row (next to the `SquarePen`/`FoldVertical` actions), where `working()` is the panel's existing in-flight signal.
- `switchMode(next)`: `await props.client.setMode({mode: next})`; on 409 show the existing error surface (`apiError` pattern already in this file); on success `setMode(next)`; when `next === 'chat'`, re-fire the panel's existing `client.history` load path so terminal-era turns appear (reuse the signal it already uses to (re)load history — no parallel mechanism).
- Body: `<Show when={mode() === 'terminal'} fallback={<existing thread + composer/>}><TerminalView client={props.client} onBusyChange={setTerminalBusy} onBackToChat={() => switchMode('chat')}/></Show>` — composer hidden in terminal mode (TUI owns input).
- `TerminalView` accepts `onBusyChange` and forwards the model's `busy` signal via `createEffect` so the header toggle disables while the TUI runs.

Extension hook: inside `TerminalView`, render `<ExtensionSurface name="terminal-header" ...>` (same host-bag props as the other `ExtensionSurface` usages in `chat-panel.tsx`) in a slim strip above the terminal screen, so extensions can contribute terminal-adjacent controls without touching this feature's internals.

- [ ] **Step 5: Build + typecheck + visual check**

```bash
pnpm turbo build --filter=@conciv/core --filter=@conciv/ui-kit-terminal --filter=@conciv/widget
pnpm turbo typecheck --filter=@conciv/widget
```

Expected: clean. Then run the dev example app, open the widget, toggle to terminal, compare against `docs/superpowers/specs/assets/2026-07-04-tty-terminal-mode-mockup.html` — segmented header toggle, full-bleed terminal, banner on `/exit`. Fix visual drift now, not later. (Widget change = hard reload; core change = restart `pnpm dev`.)

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/chat/terminal-view.tsx packages/widget/src/chat/mode-toggle.tsx packages/widget/src/chat/chat-panel.tsx packages/widget/package.json pnpm-lock.yaml
git commit -m "feat(widget): chat/terminal mode toggle + terminal view" -- packages/widget pnpm-lock.yaml
```

---

### Task 8: End-to-end widget IT + spec amendments

**Files:**

- Create: `packages/widget/test/terminal-mode.it.test.ts`
- Modify: `docs/superpowers/specs/2026-07-04-tty-terminal-mode-design.md` (amendments section)

- [ ] **Step 1: Rebuild core, then write the failing IT**

`pnpm turbo build --filter=@conciv/core` first (ITs run built core). Model the boot/setup on `packages/widget/test/widget.it.test.ts` (real server, real claude, `browser.newPage()`, unique `browser.api.port`, `domcontentloaded` — never `networkidle`).

```ts
// packages/widget/test/terminal-mode.it.test.ts — assertions core (boot copied from widget.it.test.ts)
import {describe, expect, it} from 'vitest'

const terminalBuffer = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const host = document.querySelector('[data-conciv-root]')
    const screen = host?.shadowRoot?.querySelector('[data-terminal-screen]')
    const api = (screen as {__concivTerminal?: {buffer(): string}} | null)?.__concivTerminal
    return api ? api.buffer() : ''
  })

describe('terminal mode', () => {
  it('toggles to a live claude TUI, runs a turn, and rehydrates chat', async () => {
    // 1. open widget, send one chat turn ("say exactly: marker-alpha"), wait for reply
    // 2. click the Terminal segment (role=button, name /terminal/i inside group "View mode")
    await page.getByRole('button', {name: /terminal/i}).click()
    // 3. TUI appears: poll terminalBuffer until it contains the resumed marker
    await expect.poll(() => terminalBuffer(page), {timeout: 30_000}).toContain('marker-alpha')
    // 4. type a turn into the TUI via keyboard (real keystrokes through the WS)
    await page.keyboard.type('say exactly: marker-beta')
    await page.keyboard.press('Enter')
    await expect.poll(() => terminalBuffer(page), {timeout: 60_000}).toContain('marker-beta')
    // 5. back to chat once idle (toggle re-enables), assert rehydrated history
    await expect.poll(async () => page.getByRole('button', {name: /chat/i}).isEnabled(), {timeout: 60_000}).toBe(true)
    await page.getByRole('button', {name: /chat/i}).click()
    await expect(page.getByText('marker-beta')).toBeVisible({timeout: 15_000})
  })

  it('offers the toggle in a quick-terminal pane too', async () => {
    // open the quick terminal surface (hotkey/FAB per widget.it.test.ts patterns),
    // assert the pane header exposes the "View mode" group with both segments
    await expect(page.getByRole('group', {name: 'View mode'}).getByRole('button', {name: /terminal/i})).toBeVisible()
  })
})
```

xterm renders to canvas, so `getByText` cannot see terminal content; expose a minimal buffer reader from `TerminalPrimitive.Screen` — set `element.__concivTerminal = {buffer: () => translateBuffer(model.terminal)}` on mount (tiny, typed via a module-level declaration, serves the IT the way `data-terminal-screen` anchors do; it is the observable terminal content, not an implementation detail). Add `translateBuffer` to ui-kit-terminal's model file and reuse it in the package test from Task 6 instead of the test-local `bufferText`.

- [ ] **Step 2: Run the IT**

Run: `pnpm --filter @conciv/widget vitest run test/terminal-mode.it.test.ts`
Expected: FAIL first on missing buffer hook (add it), then iterate to PASS. Budget real time: two live claude turns.

- [ ] **Step 3: Full suites**

```bash
pnpm turbo build --filter=@conciv/core --filter=@conciv/ui-kit-terminal --filter=@conciv/widget
pnpm --filter @conciv/core test
pnpm --filter @conciv/ui-kit-terminal test
pnpm --filter @conciv/widget test
```

Expected: PASS across the board.

- [ ] **Step 4: Amend the spec**

Append to `docs/superpowers/specs/2026-07-04-tty-terminal-mode-design.md`:

```markdown
## Amendments (2026-07-04, planning/implementation)

- Rehydration reuses `GET /api/chat/history` (full transcript re-fetch) instead of a high-water-mark decode; simpler and already tested.
- Mode state is in-memory in the core tty service; core restart resets every session to chat mode (ptys die with the process anyway).
- Terminal UI ships as `@conciv/ui-kit-terminal` (compound primitives + styled wrapper) for hard encapsulation; the widget contributes only the toggle, theme-token reading, and the view swap.
```

- [ ] **Step 5: Commit**

```bash
git add packages/widget/test/terminal-mode.it.test.ts packages/ui-kit-terminal/src packages/ui-kit-terminal/test docs/superpowers/specs/2026-07-04-tty-terminal-mode-design.md
git commit -m "test(widget): terminal mode end-to-end IT + spec amendments" -- packages/widget packages/ui-kit-terminal docs/superpowers/specs
```

---

## Self-review checklist (run after writing, before handoff)

- Spec coverage: toggle (T7), same-conversation resume (T2/T5), exact bytes over WS (T4/T5), xterm render + shadow css + theme (T6/T7), busy gating both sides (T3/T5/T7), rehydrate (T7 step 4), exit banner (T6), error frames (T5/T6), replay/reconnect (T4/T5), idle evict (T4), security/origin (T5 notes), mockup fidelity (T7 step 5), testing pyramid (T3-T8). Out-of-scope items honored (no other harness descriptors, single canonical size with last-resize-wins, no restart persistence).
- Known deliberate deltas from spec are listed in "Spec amendments" and land in the spec file in Task 8.
