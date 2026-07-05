# Terminal View Augmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Composer-action parity in the terminal view plus web augmentation of the TTY claude: action row, MCP page tools, grab tray, frame-safe stream injection, and a live rich mirror pane.

**Architecture:** The terminal extension (`packages/extensions/terminal`) grows a frame-safe injection chokepoint on the server relay and an action-row/mirror client. The widget renders view-contributed actions in the tab bar and a grab tray above active views. The harness gains MCP args for tty spawn and a transcript-messages surface reused from the history parser.

**Tech Stack:** SolidJS, xterm.js 6, node-pty, H3 + crossws WebSockets, SSE, zod, vitest (environment `node`, real servers, no mocks).

**Spec:** `docs/superpowers/specs/2026-07-04-terminal-view-augmentation-design.md`

## Global Constraints

- Functions only, no classes. No IIFEs. Zero narration comments. No `any`, no casts, no non-null assertions (`x!`), no `else` where guard clauses work.
- No barrel files; import from source modules.
- Tests: native assertions (`getByRole`/text/`toBeVisible` in browser tests; behavior not CSS). No jsdom — vitest configs pin `environment: 'node'`; browser tests run real Playwright. No stubs/mocks — real pty, real WS, real files.
- Build/typecheck via turbo: `pnpm turbo build --filter=<pkg>`, `pnpm turbo typecheck --filter=<pkg>`.
- Widget ITs need core/extension dist rebuilt after src edits: `pnpm turbo build --filter=@conciv/extension-terminal --filter=@conciv/core`.
- Commit with explicit pathspec (`git commit -- <paths>`); if the prek hook races, run `pnpm oxfmt` on touched files then `git commit --no-verify -- <paths>`.
- Session identity: conciv session id rides `CONCIV_SESSION_HEADER`; harness token = claude session uuid.
- Verified facts (do not re-litigate): claude wraps repaints in `ESC[?2026h/l`; transcript JSONL grows mid-turn; `--resume <token> --model <other>` composes.

---

### Task 1: Frame-safe injector

**Files:**

- Create: `packages/extensions/terminal/src/server/frame-injector.ts`
- Test: `packages/extensions/terminal/test/frame-injector.test.ts`

**Interfaces:**

- Consumes: nothing (pure).
- Produces: `createFrameInjector(write: (chunk: string) => void): FrameInjector` with `FrameInjector = {feed(chunk: string): void; inject(text: string): void; pending(): number}`. `feed` forwards pty chunks to `write` verbatim and tracks synchronized-update state; `inject` sanitizes to SGR-only ANSI, queues, and flushes as `\r\n<text>\r\n` through the same `write` only when outside a `?2026` frame. Marker split across chunk boundaries must still be detected (carry tail like `osc-busy.ts`).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {createFrameInjector} from '../src/server/frame-injector.js'

const BEGIN = '\u001b[?2026h'
const END = '\u001b[?2026l'

function collect(): {out: string[]; write: (chunk: string) => void} {
  const out: string[] = []
  return {out, write: (chunk) => out.push(chunk)}
}

describe('frame injector', () => {
  it('forwards pty chunks verbatim', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed('hello')
    expect(out).toEqual(['hello'])
  })

  it('injects immediately while idle', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.inject('note')
    expect(out).toEqual(['\r\nnote\r\n'])
  })

  it('defers injection until the frame closes', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(`${BEGIN}painting`)
    injector.inject('note')
    expect(out).toEqual([`${BEGIN}painting`])
    expect(injector.pending()).toBe(1)
    injector.feed(`more${END}`)
    expect(out).toEqual([`${BEGIN}painting`, `more${END}`, '\r\nnote\r\n'])
    expect(injector.pending()).toBe(0)
  })

  it('handles a marker split across chunks', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed('\u001b[?20')
    injector.feed('26hframe')
    injector.inject('note')
    expect(out.join('')).not.toContain('note')
    injector.feed(END)
    expect(out.join('')).toContain('\r\nnote\r\n')
  })

  it('flushes queued injections in order', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(BEGIN)
    injector.inject('one')
    injector.inject('two')
    injector.feed(END)
    expect(out.join('')).toContain('\r\none\r\n\r\ntwo\r\n')
  })

  it('keeps SGR styling but strips cursor and OSC sequences', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.inject('\u001b[32mok\u001b[0m \u001b[2Amoved \u001b]0;title\u0007done')
    expect(out.join('')).toBe('\r\n\u001b[32mok\u001b[0m moved done\r\n')
  })

  it('uses the last marker in a chunk to decide state', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(`${BEGIN}a${END}b${BEGIN}`)
    injector.inject('note')
    expect(out.join('')).not.toContain('note')
    injector.feed(`c${END}d${BEGIN}e${END}`)
    expect(out.join('')).toContain('note')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/extension-terminal exec vitest run test/frame-injector.test.ts`
Expected: FAIL — cannot resolve `../src/server/frame-injector.js`.

- [ ] **Step 3: Write the implementation**

```ts
const MARKER = /\u001b\[\?2026([hl])/g
const CARRY_MAX = 16
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b./g
const SGR = /^\u001b\[[0-9;]*m$/

export type FrameInjector = {
  feed(chunk: string): void
  inject(text: string): void
  pending(): number
}

export function sanitizeInjection(text: string): string {
  return text.replaceAll(ANSI_SEQUENCE, (sequence) => (SGR.test(sequence) ? sequence : ''))
}

export function createFrameInjector(write: (chunk: string) => void): FrameInjector {
  const state = {carry: '', inFrame: false, queue: [] as string[]}

  const flush = (): void => {
    for (const text of state.queue.splice(0)) write(`\r\n${text}\r\n`)
  }

  const feed = (chunk: string): void => {
    write(chunk)
    const text = state.carry + chunk
    const cursor = {end: 0}
    for (const match of text.matchAll(MARKER)) {
      state.inFrame = match[1] === 'h'
      cursor.end = match.index + match[0].length
    }
    const rest = text.slice(cursor.end)
    const tail = rest.lastIndexOf('\u001b')
    state.carry = tail >= 0 && rest.length - tail <= CARRY_MAX ? rest.slice(tail) : ''
    if (!state.inFrame) flush()
  }

  const inject = (text: string): void => {
    state.queue.push(sanitizeInjection(text))
    if (!state.inFrame) flush()
  }

  return {feed, inject, pending: () => state.queue.length}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/extension-terminal exec vitest run test/frame-injector.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/terminal/src/server/frame-injector.ts packages/extensions/terminal/test/frame-injector.test.ts
git commit -m "feat(terminal): frame-safe ANSI injector" -- packages/extensions/terminal/src/server/frame-injector.ts packages/extensions/terminal/test/frame-injector.test.ts
```

---

### Task 2: Inject through pty sessions (replay-consistent)

**Files:**

- Modify: `packages/extensions/terminal/src/server/pty-sessions.ts`
- Test: `packages/extensions/terminal/test/pty-sessions.it.test.ts` (append)

**Interfaces:**

- Consumes: `createFrameInjector`, `sanitizeInjection` from Task 1.
- Produces: `TtySession.inject(text: string): void`. Injected bytes flow through the same record+broadcast path as pty output, so they land in the replay buffer and reach every attached sink.

- [ ] **Step 1: Write the failing test** — append to the existing IT file, reusing its real-bash session helpers (follow the file's existing `createTtySessions` + sink patterns):

```ts
it('injects into live sinks and the replay buffer', async () => {
  const sessions = createTtySessions({idleEvictMs: 60_000})
  const session = sessions.open('s-inject', bashCommand(), process.cwd())
  const received: string[] = []
  const detach = session.attach({data: (chunk) => received.push(chunk), control: () => {}})
  session.inject('conciv marker')
  await waitFor(() => received.join('').includes('\r\nconciv marker\r\n'))
  detach()
  const replayed: string[] = []
  const detachLate = session.attach({data: (chunk) => replayed.push(chunk), control: () => {}})
  expect(replayed.join('')).toContain('\r\nconciv marker\r\n')
  detachLate()
  sessions.shutdown()
})
```

Use the file's existing `bashCommand`/`waitFor` helpers; if named differently, match the file's local names.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/extension-terminal exec vitest run test/pty-sessions.it.test.ts`
Expected: FAIL — `session.inject is not a function`.

- [ ] **Step 3: Implement** — in `pty-sessions.ts`:

Add to imports: `import {createFrameInjector, type FrameInjector} from './frame-injector.js'`

Add `injector: FrameInjector` to `Entry`. In `open()` build the entry first with a self-referential injector whose write records and broadcasts:

```ts
const entry: Entry = {
  pty: null,
  session,
  replay: [],
  replaySize: 0,
  sinks: new Set(),
  tracker: createOscBusyTracker(),
  exit: null,
  error: null,
  idle: null,
  injector: createFrameInjector((chunk) => {
    record(entry, chunk)
    for (const sink of entry.sinks) sink.data(chunk)
  }),
}
```

In `spawnPty`, replace the `onData` body's record/broadcast with the injector chokepoint:

```ts
entry.pty.onData((chunk) => {
  entry.tracker.feed(chunk)
  entry.injector.feed(chunk)
})
```

Add to the `session` object (and the `TtySession` type):

```ts
inject: (text) => {
  const entry = entries.get(sessionId)
  if (entry && !entry.exit) entry.injector.inject(text)
},
```

- [ ] **Step 4: Run the full package tests**

Run: `pnpm --filter @conciv/extension-terminal test`
Expected: PASS — all existing pty/routes/osc tests still green plus the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/terminal/src/server/pty-sessions.ts packages/extensions/terminal/test/pty-sessions.it.test.ts
git commit -m "feat(terminal): pty sessions inject via frame-safe chokepoint" -- packages/extensions/terminal/src/server/pty-sessions.ts packages/extensions/terminal/test/pty-sessions.it.test.ts
```

---

### Task 3: Inject control frame — WS route + client model

**Files:**

- Modify: `packages/protocol/src/terminal-types.ts`
- Modify: `packages/extensions/terminal/src/server.ts`
- Modify: `packages/ui-kit-terminal/src/model.ts`
- Test: `packages/extensions/terminal/test/routes.it.test.ts` (append), `packages/ui-kit-terminal/test/model.test.ts` (append; follow the file's existing WS-stub or `__test` conventions)

**Interfaces:**

- Consumes: `TtySession.inject` from Task 2.
- Produces: `TtyClientControlSchema` becomes a discriminated union: `{type:'resize', cols, rows} | {type:'inject', text: string}` (text max 4096). `TerminalModel.inject(text: string): void` sends the JSON frame over the open socket.

- [ ] **Step 1: Update protocol**

```ts
export const TtyClientControlSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(500),
  }),
  z.object({type: z.literal('inject'), text: z.string().min(1).max(4096)}),
])
```

Run: `pnpm turbo build --filter=@conciv/protocol` — expect typecheck failures in `server.ts`/`model.ts` consumers to surface next.

- [ ] **Step 2: Write the failing route test** — append to `routes.it.test.ts` using its existing open-session + WS helpers:

```ts
it('inject control frame writes a marker readable by a reconnecting socket', async () => {
  const {ws, sessionId} = await openTerminalWithSocket()
  ws.send(JSON.stringify({type: 'inject', text: 'conciv says hi'}))
  await waitForData(ws, (all) => all.includes('\r\nconciv says hi\r\n'))
  ws.close()
  const second = await reconnectSocket(sessionId)
  await waitForData(second, (all) => all.includes('\r\nconciv says hi\r\n'))
  second.close()
})
```

Match the file's actual helper names for opening the extension server, session, and websocket.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/extension-terminal exec vitest run test/routes.it.test.ts`
Expected: FAIL — inject frame ignored (current `parseControl` only accepts resize).

- [ ] **Step 4: Implement server handling** — in `server.ts`, replace `parseControl` and the `message` branch:

```ts
import {TtyClientControlSchema, type TtyClientControl} from '@conciv/protocol/terminal-types'

function parseControl(text: string): TtyClientControl | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

```ts
message(peer, message) {
  const url = new URL(peer.request?.url ?? 'http://localhost/tty')
  const sessionId = url.searchParams.get('session') ?? ''
  const session = ttySessions.get(sessionId)
  if (!session) return
  const text = message.text()
  const control = parseControl(text)
  if (control?.type === 'resize') {
    session.resize(control.cols, control.rows)
    return
  }
  if (control?.type === 'inject') {
    session.inject(control.text)
    return
  }
  session.write(text)
},
```

- [ ] **Step 5: Add `model.inject`** — in `packages/ui-kit-terminal/src/model.ts`, add to `TerminalModel` type and the returned object:

```ts
inject: (text: string) => {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({type: 'inject', text}))
},
```

Add a model unit test mirroring the file's existing socket assertions: `model.inject('x')` sends `{"type":"inject","text":"x"}` on an open socket and is a no-op when disconnected.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @conciv/extension-terminal test && pnpm --filter @conciv/ui-kit-terminal test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/terminal-types.ts packages/extensions/terminal/src/server.ts packages/ui-kit-terminal/src/model.ts packages/extensions/terminal/test/routes.it.test.ts packages/ui-kit-terminal/test/model.test.ts
git commit -m "feat(terminal): inject control frame end to end" -- packages/protocol/src/terminal-types.ts packages/extensions/terminal/src/server.ts packages/ui-kit-terminal/src/model.ts packages/extensions/terminal/test/routes.it.test.ts packages/ui-kit-terminal/test/model.test.ts
```

---

### Task 4: MCP parity + model override at spawn

**Files:**

- Modify: `packages/protocol/src/terminal-types.ts` (`TtyCommandOpts`)
- Modify: `packages/harness/src/claude/tty.ts`
- Modify: `packages/extensions/terminal/src/shared/protocol.ts` (`TerminalOpenRequestSchema`)
- Modify: `packages/extensions/terminal/src/server.ts` (open route)
- Test: `packages/harness/test/claude-tty.test.ts` (or the existing tty unit test file — extend it), `packages/extensions/terminal/test/routes.it.test.ts` (append)

**Interfaces:**

- Consumes: `claudeMcpArgs(mcpUrl, sessionId)` from `packages/harness/src/claude/args.ts`.
- Produces: `TtyCommandOpts` gains `mcpUrl?: string | null` and `concivSessionId?: string`. `TerminalOpenRequestSchema` gains `model?: string`. The open route passes `model: body.model ?? await sessions.model(sessionId)`, `mcpUrl: `${new URL(event.req.url).origin}/api/mcp``, and `concivSessionId: sessionId`.

- [ ] **Step 1: Failing harness test**

```ts
it('appends conciv mcp args when mcpUrl provided', () => {
  const command = claudeTtyCommand({
    cwd: '/tmp/x',
    harnessSessionId: 'tok-1',
    resume: false,
    mcpUrl: 'http://localhost:4111/api/mcp',
    concivSessionId: 'conciv-1',
  })
  const joined = command.args.join(' ')
  expect(joined).toContain('--mcp-config')
  expect(joined).toContain('--strict-mcp-config')
  expect(joined).toContain('http://localhost:4111/api/mcp')
  expect(joined).toContain('conciv-1')
})

it('omits mcp args without mcpUrl', () => {
  const command = claudeTtyCommand({cwd: '/tmp/x', harnessSessionId: 'tok-1', resume: true})
  expect(command.args.join(' ')).not.toContain('--mcp-config')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/harness test`
Expected: FAIL — unknown option `mcpUrl` / args missing.

- [ ] **Step 3: Implement**

`terminal-types.ts`:

```ts
export type TtyCommandOpts = {
  cwd: string
  harnessSessionId: string
  resume: boolean
  model?: string | null
  mcpUrl?: string | null
  concivSessionId?: string
}
```

`tty.ts`:

```ts
import {claudeMcpArgs} from './args.js'

export function claudeTtyCommand(opts: TtyCommandOpts): TtyCommand {
  const base = opts.resume ? ['--resume', opts.harnessSessionId] : ['--session-id', opts.harnessSessionId]
  const withModel = opts.model ? [...base, '--model', opts.model] : base
  const args = opts.mcpUrl ? [...withModel, ...claudeMcpArgs(opts.mcpUrl, opts.concivSessionId)] : withModel
  return {
    bin: 'claude',
    args,
    env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
    unsetEnvPrefixes: NESTED_SESSION_MARKERS,
  }
}
```

`shared/protocol.ts`:

```ts
export const TerminalOpenRequestSchema = z.object({
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(500).optional(),
  model: z.string().min(1).max(200).optional(),
})
```

`server.ts` open route — replace the model + spawn lines:

```ts
const model = size.model ?? (await server.sessions.model(sessionId))
const resume = Boolean(existing) && (server.harness.transcriptExists?.(harnessSessionId) ?? true)
server.harness.release?.(sessionId)
const mcpUrl = `${new URL(event.req.url).origin}/api/mcp`
const session = ttySessions.open(
  sessionId,
  ttyCommand({cwd: server.cwd, harnessSessionId, resume, model, mcpUrl, concivSessionId: sessionId}),
  server.cwd,
)
if (resume) session.inject('\u001b[2m— conciv: resumed session —\u001b[0m')
```

The resumed marker is the spec's server self-inject notice: it rides the Task 2 injector, so it lands in replay and scrolls with history. Assert it in the route IT (open with an existing token + transcript → first WS data contains the marker).

- [ ] **Step 4: Route IT** — append to `routes.it.test.ts`: switch the fake harness (`bashHarness` in `test/helpers.ts`) to capture opts — add a `capturedOpts: TtyCommandOpts[]` array on a new helper `recordingHarness()` that wraps `bashHarness.ttyCommand`, then assert open with `{model: 'claude-x'}` produces `opts.model === 'claude-x'`, `opts.mcpUrl` ending in `/api/mcp`, and `opts.concivSessionId` equal to the session header.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @conciv/harness test && pnpm --filter @conciv/extension-terminal test && pnpm turbo typecheck --filter=@conciv/protocol --filter=@conciv/harness --filter=@conciv/extension-terminal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/terminal-types.ts packages/harness/src/claude/tty.ts packages/extensions/terminal/src/shared/protocol.ts packages/extensions/terminal/src/server.ts packages/harness/test packages/extensions/terminal/test
git commit -m "feat(terminal): tty spawn gains conciv mcp config and model override" -- packages/protocol/src/terminal-types.ts packages/harness/src/claude/tty.ts packages/extensions/terminal/src/shared/protocol.ts packages/extensions/terminal/src/server.ts packages/harness/test packages/extensions/terminal/test
```

---

### Task 5: `ExtensionView.actions` in the tab bar + view survives session switch

**Files:**

- Modify: `packages/extension/src/types.ts:14` (`ExtensionView`)
- Modify: `packages/widget/src/chat/chat-panel.tsx` (tab row at 471-488, session effect at 317-327)
- Test: `packages/widget/test/` — extend the existing panel-views widget IT (the one asserting tabs appear with a view-contributing extension)

**Interfaces:**

- Consumes: `MountedView` from `@conciv/extension/client` (props: `{view, hostContext, clientValue}`).
- Produces: `ExtensionView = {id; label; icon?; Component; actions?: Component}`. Widget renders `actions` right-aligned in the tab row while that view is active, mounted with the same hostContext (including the working `view` host: `setLocked`/`leave`/`onInsert` — `onInsert` arrives in Task 7; until then keep the existing two members).

- [ ] **Step 1: Type change** — `types.ts`:

```ts
export type ExtensionView = {
  id: string
  label: string
  icon?: Component<{class?: string}>
  Component: Component
  actions?: Component
}
```

- [ ] **Step 2: Failing widget IT** — in the widget IT that mounts a fake view-contributing extension, extend the fake view with `actions: () => <button type="button">probe-action</button>` and assert: button visible while the view tab is active, absent on the Chat tab.

Run: `pnpm --filter @conciv/widget test -- --reporter=dot` (or the project's IT invocation for that file)
Expected: FAIL — no `probe-action` button.

- [ ] **Step 3: Implement tab-row actions** — in `chat-panel.tsx`, extract the host-context construction used by `renderActiveView` so both body and actions share it:

```ts
const viewHostContext = (view: PanelView) => ({
  ...hostBag,
  view: {setLocked: setLockedFor(view.id), leave: () => switchView('chat')},
})
```

Replace the tab bar block (471-488) with a flex row hosting the actions:

```tsx
<Show when={views().length > 0}>
  <div class="flex items-center gap-2 px-2.5">
    <Tabs.Root value={activeView()} onValueChange={(details) => switchView(details.value)} class="flex-1 min-w-0">
      <Tabs.List>
        <Tabs.Trigger value="chat" disabled={leaveGuard()}>
          Chat
        </Tabs.Trigger>
        <For each={views()}>
          {(view) => (
            <Tabs.Trigger value={view.id} disabled={leaveGuard()}>
              <Show when={view.icon}>{(icon) => <Dynamic component={icon()} class="size-3.5" />}</Show>
              {view.label}
            </Tabs.Trigger>
          )}
        </For>
        <Tabs.Indicator />
      </Tabs.List>
    </Tabs.Root>
    <Show when={currentView()}>
      {(view) => (
        <Show when={view().actions}>
          {(actions) => (
            <div class="flex items-center gap-1">
              <MountedView
                view={{...view(), Component: actions()}}
                hostContext={viewHostContext(view())}
                clientValue={view().instance.clientValue}
              />
            </div>
          )}
        </Show>
      )}
    </Show>
  </div>
</Show>
```

Update `renderActiveView` to use `viewHostContext(view)`.

- [ ] **Step 4: View survives session change** — in the `createEffect` at 317-327, skip the forced chat switch while a view is active (the view reacts to `client.sessionId()` itself; chat rehydrates via `switchView('chat')`):

```ts
createEffect(() => {
  const id = client.sessionId()
  if (!props.active || !id) return
  props.onActiveSession?.(id)
  if (id === loadedSessionId.current) {
    focusInput()
    return
  }
  if (currentView()) return
  setActiveView('chat')
  void loadSession(id).then(focusInput)
})
```

- [ ] **Step 5: Run tests**

Run: `pnpm turbo build --filter=@conciv/extension && pnpm --filter @conciv/widget test`
Expected: PASS including the new actions assertion.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/types.ts packages/widget/src/chat/chat-panel.tsx packages/widget/test
git commit -m "feat(widget): view-contributed tab-bar actions; views survive session switch" -- packages/extension/src/types.ts packages/widget/src/chat/chat-panel.tsx packages/widget/test
```

---

### Task 6: Terminal action row (model chip · new session · open externally) + respawn

**Files:**

- Create: `packages/extensions/terminal/src/client/terminal-actions.tsx`
- Create: `packages/extensions/terminal/src/client/terminal-store.ts`
- Modify: `packages/extensions/terminal/src/client.tsx`
- Modify: `packages/extensions/terminal/src/client/terminal-panel-view.tsx`
- Modify: `packages/extensions/terminal/package.json` (add dependency `"@conciv/ui-kit-chat": "workspace:*"`, `"lucide-solid"` if absent)
- Test: extend `packages/extensions/terminal` client tests if present; behavior lands in the widget IT (Task 12)

**Interfaces:**

- Consumes: `ctx.client` (`SessionClient`: `sessionId()`, `launch({model})`, `chatHeaders()`), `ctx.newSession`, `ctx.notify`, `ctx.view.leave`, `ModelSelector` from `@conciv/ui-kit-chat`, `defineClient` from `@conciv/api-client` (models list), open/close endpoints from the view.
- Produces: shared client store `createTerminalStore(): TerminalStore` where `TerminalStore = {spawnModel: () => string | null; setSpawnModel(model: string | null): void; respawnTick: () => number; bumpRespawn(): void}` exposed via the extension client value; `TerminalActions` component registered as `views[0].actions`.

- [ ] **Step 1: Store** — `terminal-store.ts`:

```ts
import {createSignal} from 'solid-js'

export type TerminalStore = {
  spawnModel: () => string | null
  setSpawnModel: (model: string | null) => void
  respawnTick: () => number
  bumpRespawn: () => void
  busy: () => boolean
  setBusy: (busy: boolean) => void
}

export function createTerminalStore(): TerminalStore {
  const [spawnModel, setSpawnModel] = createSignal<string | null>(null)
  const [respawnTick, setRespawnTick] = createSignal(0)
  const [busy, setBusy] = createSignal(false)
  return {spawnModel, setSpawnModel, respawnTick, bumpRespawn: () => setRespawnTick((n) => n + 1), busy, setBusy}
}
```

- [ ] **Step 2: Register store + actions** — `client.tsx`:

```tsx
import {SquareTerminal} from 'lucide-solid'
import {defineExtension} from '@conciv/extension'
import {TERMINAL_NAME} from './shared/protocol.js'
import {TerminalPanelView} from './client/terminal-panel-view.js'
import {TerminalActions} from './client/terminal-actions.js'
import {createTerminalStore} from './client/terminal-store.js'

export const terminal = defineExtension({
  name: TERMINAL_NAME,
  views: [
    {id: 'terminal', label: 'Terminal', icon: SquareTerminal, Component: TerminalPanelView, actions: TerminalActions},
  ],
}).client(() => ({value: {store: createTerminalStore()}}))

export default terminal
```

(Match the exact `.client()` signature used by other builtin extensions — see `packages/extensions/test-runner/src/client.tsx` for the working pattern; adjust if the factory returns `{value, dispose}`.)

- [ ] **Step 3: Actions component** — `terminal-actions.tsx`:

```tsx
import {createMemo, createSignal, onMount, Show, type JSX} from 'solid-js'
import {SquarePen, SquareTerminal} from 'lucide-solid'
import {ModelSelector, type ModelOption} from '@conciv/ui-kit-chat'
import {defineClient} from '@conciv/api-client'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {terminal} from '../client.js'

const ACT =
  'inline-flex items-center justify-center size-7 shrink-0 [border:0] rounded-pw-sm bg-transparent text-pw-text-2 cursor-pointer hover:bg-pw-fill-strong hover:text-pw-text-hi disabled:opacity-50 disabled:cursor-not-allowed'

export function TerminalActions(): JSX.Element {
  const ctx = terminal.useContext()
  const api = defineClient({apiBase: ctx.apiBase})
  const [models, setModels] = createSignal<HarnessModelInfo[]>([])
  const busy = () => ctx.store.busy()
  onMount(() => {
    void api
      .models()
      .then(({models: list}) => setModels(list))
      .catch(() => {})
  })
  const options = createMemo((): ModelOption[] =>
    models().map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      disabled: model.disabled,
    })),
  )
  const pickModel = (id: string) => {
    ctx.store.setSpawnModel(id)
    ctx.store.bumpRespawn()
  }
  const openExternally = async () => {
    try {
      const res = await ctx.client.launch({model: ctx.store.spawnModel() ?? undefined})
      if (!res.supported || !res.command) {
        ctx.notify('This harness can’t be opened in a terminal.')
        return
      }
      ctx.view.leave()
      if (res.opened) {
        ctx.notify('Opened externally.')
        return
      }
      await navigator.clipboard.writeText(res.command).then(
        () => ctx.notify('Command copied — paste it in your terminal.'),
        () => ctx.notify(`Run in your terminal: ${res.command}`),
      )
    } catch {
      ctx.notify('Couldn’t open externally.')
    }
  }
  return (
    <>
      <Show when={options().length > 0}>
        <ModelSelector.Root models={options()} value={ctx.store.spawnModel() ?? undefined} onValueChange={pickModel}>
          <ModelSelector.Trigger />
          <ModelSelector.Content>
            <ModelSelector.Search placeholder="Search models…" />
          </ModelSelector.Content>
        </ModelSelector.Root>
      </Show>
      <button
        type="button"
        class={ACT}
        aria-label="Start a new session"
        disabled={busy()}
        onClick={() => ctx.newSession()}
      >
        <SquarePen class="size-5 block" aria-hidden="true" />
      </button>
      <button
        type="button"
        class={ACT}
        aria-label="Open externally"
        disabled={busy()}
        onClick={() => void openExternally()}
      >
        <SquareTerminal class="size-5 block" aria-hidden="true" />
      </button>
    </>
  )
}
```

Note: `ctx.store` types flow from the client value — confirm the extension runtime context exposes the client value fields directly (it spreads `clientValue` into the context; see `mount-extension.ts`). The view feeds `ctx.store.setBusy(model.busy())` in the same `createEffect` that already calls `ctx.view.setLocked(model.busy())` (Task 6 Step 4 touches that file), so actions disable while a TUI turn runs. Model chip picking must also seed from the chat's persisted key: read `localStorage['pw-conciv-model']` once in `onMount` and `setSpawnModel` if unset.

- [ ] **Step 4: Respawn in the view** — in `terminal-panel-view.tsx`, react to session + respawn tick, close then reopen:

```tsx
const respawn = async (): Promise<void> => {
  await fetch(terminalUrl(ctx.apiBase, 'close'), {
    method: 'POST',
    credentials: 'include',
    headers: {'content-type': 'application/json', ...ctx.client.chatHeaders()},
  }).catch(() => {})
  await refetch()
}
createEffect(
  on([() => ctx.client.sessionId(), () => ctx.store.respawnTick()], (_next, prev) => {
    if (prev !== undefined) void respawn()
  }),
)
```

Extend the existing lock effect to also feed the store: `createEffect(() => { ctx.view.setLocked(model.busy()); ctx.store.setBusy(model.busy()) })` with `onCleanup(() => ctx.store.setBusy(false))`.

`openTerminal` body adds the model to the POST body: `body: JSON.stringify({cols: DEFAULT_COLS, rows: DEFAULT_ROWS, model: ctx.store.spawnModel() ?? undefined})`. The websocket must reconnect after respawn — recreate the terminal model per open: wrap `<Terminal>` in `<Show keyed when={openedKey()}>` where `openedKey` bumps on each successful `refetch`, and build the model inside that scope so a fresh WS/url pair attaches per pty (dispose the old model via `onCleanup` in that scope).

- [ ] **Step 5: Build + typecheck + tests**

Run: `pnpm turbo build --filter=@conciv/extension-terminal && pnpm turbo typecheck --filter=@conciv/extension-terminal && pnpm --filter @conciv/extension-terminal test`
Expected: PASS. Full behavior verified in Task 12's widget IT.

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/terminal/src packages/extensions/terminal/package.json pnpm-lock.yaml
git commit -m "feat(terminal): action row with model chip, new session, open externally" -- packages/extensions/terminal/src packages/extensions/terminal/package.json pnpm-lock.yaml
```

---

### Task 7: Grab tray above views + paste insert

**Files:**

- Modify: `packages/extension/src/types.ts:16` (`ExtensionViewHost`)
- Modify: `packages/widget/src/page/react-grab/grab-reference.tsx` (optional Insert)
- Modify: `packages/widget/src/chat/chat-panel.tsx` (tray render + insert registry)
- Modify: `packages/extensions/terminal/src/client/terminal-panel-view.tsx` (register paste handler)
- Modify: `packages/ui-kit-terminal/src/model.ts` (`paste`)
- Test: widget IT (Task 12) covers the loop; add a model unit test for `paste`

**Interfaces:**

- Produces: `ExtensionViewHost = {setLocked(locked: boolean): void; leave(): void; onInsert(handler: ((text: string) => void) | null): void}`. `GrabReference` gains optional `onInsert?: () => void` rendering an "Insert into terminal"-labeled button. `TerminalModel.paste(text: string): void` calls `terminal.paste(text)` (xterm wraps in bracketed-paste when the TUI enabled `?2004h`, and routes through `onData` → WS → pty stdin).

- [ ] **Step 1: Types** — `types.ts`:

```ts
export type ExtensionViewHost = {
  setLocked(locked: boolean): void
  leave(): void
  onInsert(handler: ((text: string) => void) | null): void
}
```

- [ ] **Step 2: model.paste** — in `model.ts` add to type + object:

```ts
paste: (text: string) => terminal.paste(text),
```

Unit test: open a model without a socket, spy via `terminal.onData((d) => received.push(d))`, call `model.paste('hi')`, assert received joined contains `hi` (bracketed markers only when the emulated app enabled paste mode — assert plain passthrough).

- [ ] **Step 3: GrabReference Insert** — add prop `onInsert?: () => void`; after `ScaledSnapshot`, render:

```tsx
<Show when={props.onInsert}>
  {(insert) => (
    <button
      type="button"
      class="py-1 px-2.5 rounded-pw-sm [border:none] text-[0.6875rem] font-semibold cursor-pointer bg-pw-accent text-white"
      onClick={() => insert()()}
    >
      Insert
    </button>
  )}
</Show>
```

- [ ] **Step 4: chat-panel tray + registry**

```ts
const [viewInsertHandlers, setViewInsertHandlers] = createSignal<Record<string, (text: string) => void>>({})
const viewHostContext = (view: PanelView) => ({
  ...hostBag,
  view: {
    setLocked: setLockedFor(view.id),
    leave: () => switchView('chat'),
    onInsert: (handler: ((text: string) => void) | null) =>
      setViewInsertHandlers((prev) => {
        const next = {...prev}
        if (handler) next[view.id] = handler
        if (!handler) delete next[view.id]
        return next
      }),
  },
})
```

Also update `hostBag`'s inert default: `view: {setLocked: () => {}, leave: () => {}, onInsert: () => {}}`.

Render the tray by wrapping the view fallback (line 489):

```tsx
<Show when={!currentView()} fallback={
  <>
    <Show when={grabs().length > 0}>
      <div class="flex flex-wrap gap-2 px-2.5 pt-2">
        <For each={grabs()}>
          {(g) => {
            const handler = () => {
              const view = currentView()
              return view ? viewInsertHandlers()[view.id] : undefined
            }
            return (
              <GrabReference
                grab={g}
                maxWidth={GRAB_PREVIEW_MAX_W}
                onRemove={() => removeGrab(g)}
                onInsert={handler() ? () => {
                  handler()?.(g.text)
                  removeGrab(g)
                } : undefined}
              />
            )
          }}
        </For>
      </div>
    </Show>
    {renderActiveView()}
  </>
}>
```

- [ ] **Step 5: Terminal registers the handler** — in `terminal-panel-view.tsx`:

```ts
onMount(() => ctx.view.onInsert((text) => model.paste(text)))
onCleanup(() => ctx.view.onInsert(null))
```

(With the keyed-model refactor from Task 6, register per model scope so paste always targets the live socket.)

- [ ] **Step 6: Build + tests**

Run: `pnpm turbo build --filter=@conciv/extension --filter=@conciv/ui-kit-terminal --filter=@conciv/extension-terminal && pnpm --filter @conciv/widget test && pnpm --filter @conciv/ui-kit-terminal test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/types.ts packages/widget/src/page/react-grab/grab-reference.tsx packages/widget/src/chat/chat-panel.tsx packages/extensions/terminal/src/client/terminal-panel-view.tsx packages/ui-kit-terminal/src/model.ts packages/ui-kit-terminal/test
git commit -m "feat(widget+terminal): grab tray above views with paste insert" -- packages/extension/src/types.ts packages/widget/src/page/react-grab/grab-reference.tsx packages/widget/src/chat/chat-panel.tsx packages/extensions/terminal/src/client/terminal-panel-view.tsx packages/ui-kit-terminal/src/model.ts packages/ui-kit-terminal/test
```

---

### Task 8: Overlay primitive (`rail` / `top-right`)

**Files:**

- Modify: `packages/ui-kit-terminal/src/primitives/terminal.tsx`
- Test: `packages/ui-kit-terminal/test/` — extend the primitives test file

**Interfaces:**

- Produces: `TerminalPrimitive.Overlay` — `{anchor: 'rail' | 'top-right'; class?: string; children: JSX.Element}`. `rail` renders as a flex sibling column beside the screen (Root already `relative flex`); `top-right` renders absolutely positioned inside Root. Never line-anchored.

- [ ] **Step 1: Failing test** — render Root with an Overlay child per anchor and assert the overlay content is visible and, for `rail`, sits beside (not over) the screen: assert layout via bounding rects (`overlay.x >= screen.x + screen.width` for rail), not CSS properties.

- [ ] **Step 2: Implement**

```tsx
function Overlay(props: {anchor: 'rail' | 'top-right'; class?: string; children: JSX.Element}): JSX.Element {
  const anchorClass = props.anchor === 'rail' ? 'flex flex-col min-h-0 shrink-0' : 'absolute top-2 right-2 z-10'
  return (
    <div class={`${anchorClass} ${props.class ?? ''}`} data-terminal-overlay={props.anchor}>
      {props.children}
    </div>
  )
}

export const TerminalPrimitive = {Root, Screen, Banner, Overlay}
```

For `rail` to sit beside the screen, Root's inner layout must be a row when a rail is present: change `Root`'s container to `flex` (row) and let consumers wrap Screen in their own column (`styled/terminal.tsx` already wraps Screen in `SCREEN_WRAP`; add `flex-row` on the styled root and keep the wrap as the growing column). Verify against the existing styled snapshot/behavior tests.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @conciv/ui-kit-terminal test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit-terminal/src packages/ui-kit-terminal/test
git commit -m "feat(ui-kit-terminal): overlay primitive with rail and top-right anchors" -- packages/ui-kit-terminal/src packages/ui-kit-terminal/test
```

---

### Task 9: Harness transcript-messages surface

**Files:**

- Modify: `packages/extension/src/types.ts:80-85` (`ServerHarness`)
- Modify: `packages/core/src/app.ts:101-106` (wire from `harness.history`)
- Test: `packages/core/test/api/extension-server-surfaces.it.test.ts` (append)

**Interfaces:**

- Produces: `ServerHarness.transcriptMessages?: (token: string) => Promise<UIMessage[]>` — reads the transcript via `history.transcriptPath(cwd, token)` and parses with `history.parse` (the exact history-endpoint parser; no second parser). Returns `[]` when the file is missing.

- [ ] **Step 1: Failing IT** — in the surfaces IT, write a fixture JSONL (two user/assistant lines in claude transcript format, mirroring fixtures already used by harness history tests) to `<claudeHome>/projects/<encoded-cwd>/<token>.jsonl`, then assert `serverHarness.transcriptMessages` resolves parsed messages with roles `['user','assistant']`. Note the existing IT helper realpaths tmp roots (claude transcript ITs need `realpathSync` on macOS tmp).

- [ ] **Step 2: Implement** — `types.ts`:

```ts
export type ServerHarness = {
  id: string
  ttyCommand?: (opts: TtyCommandOpts) => TtyCommand
  release?: (sessionId: string) => void
  transcriptExists?: (token: string) => boolean
  transcriptMessages?: (token: string) => Promise<UIMessage[]>
}
```

(Import `UIMessage` from `@conciv/protocol/chat-types`.)

`app.ts`:

```ts
const serverHarness: ServerHarness = {
  id: harness.id,
  ttyCommand: harness.tty?.command,
  release: harness.release,
  transcriptExists: history ? (token) => existsSync(history.transcriptPath(opts.cwd, token)) : undefined,
  transcriptMessages: history
    ? async (token) => {
        const file = history.transcriptPath(opts.cwd, token)
        const raw = await readFile(file, 'utf8').catch(() => '')
        return raw ? history.parse(raw) : []
      }
    : undefined,
}
```

(Add `import {readFile} from 'node:fs/promises'`.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @conciv/core test -- extension-server-surfaces && pnpm turbo typecheck --filter=@conciv/core --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/types.ts packages/core/src/app.ts packages/core/test/api/extension-server-surfaces.it.test.ts
git commit -m "feat(core): harness transcriptMessages surface for extensions" -- packages/extension/src/types.ts packages/core/src/app.ts packages/core/test/api/extension-server-surfaces.it.test.ts
```

---

### Task 10: Mirror SSE route

**Files:**

- Create: `packages/extensions/terminal/src/server/mirror.ts`
- Modify: `packages/extensions/terminal/src/server.ts`
- Test: `packages/extensions/terminal/test/mirror.it.test.ts`

**Interfaces:**

- Consumes: `server.sessions.resumeToken`, `server.harness.transcriptMessages` (Task 9).
- Produces: `GET /api/ext/terminal/mirror` — SSE; emits `data: {messages: UIMessage[]}` on open and whenever the parsed message list changes (poll every 500ms, compare by `JSON.stringify` length + last id). Extension test fakes get `transcriptMessages` on `bashHarness`-style helpers.

- [ ] **Step 1: Failing IT** — spin the extension test server with a fake harness whose `transcriptMessages` reads from a mutable array; open `GET /mirror` with the session header via `fetch`, read the SSE stream, assert first event carries the seed messages; push a new message into the array, assert a follow-up event arrives within 2s with the longer list.

- [ ] **Step 2: Implement** — `mirror.ts`:

```ts
import type {UIMessage} from '@conciv/protocol/chat-types'

export type MirrorSource = {
  messages(): Promise<UIMessage[]>
}

export function watchMirror(
  source: MirrorSource,
  emit: (payload: {messages: UIMessage[]}) => void,
  intervalMs = 500,
): () => void {
  const state = {fingerprint: ''}
  const tick = async (): Promise<void> => {
    const messages = await source.messages().catch((): UIMessage[] => [])
    const fingerprint = `${messages.length}:${messages.at(-1)?.id ?? ''}:${JSON.stringify(messages.at(-1)?.parts ?? []).length}`
    if (fingerprint === state.fingerprint) return
    state.fingerprint = fingerprint
    emit({messages})
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  return () => clearInterval(timer)
}
```

Route in `server.ts` (H3 SSE — same shape as core `sseStream`; the extension sub-app inherits CORS from `makeExtensionApp`, so a plain `Response` with `text/event-stream` headers suffices):

```ts
server.app.get('/mirror', async (event) => {
  const sessionId = requireSession(event.req.headers)
  const token = await server.sessions.resumeToken(sessionId)
  const transcriptMessages = server.harness.transcriptMessages
  if (!token || !transcriptMessages) throw new HTTPError({status: 404, message: 'no transcript'})
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = watchMirror({messages: () => transcriptMessages(token)}, (payload) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)),
      )
      event.req.signal?.addEventListener?.('abort', stop)
    },
  })
  return new Response(stream, {
    status: 200,
    headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'},
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @conciv/extension-terminal test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/extensions/terminal/src/server/mirror.ts packages/extensions/terminal/src/server.ts packages/extensions/terminal/test/mirror.it.test.ts packages/extensions/terminal/test/helpers.ts
git commit -m "feat(terminal): mirror SSE route streaming parsed transcript" -- packages/extensions/terminal/src/server/mirror.ts packages/extensions/terminal/src/server.ts packages/extensions/terminal/test/mirror.it.test.ts packages/extensions/terminal/test/helpers.ts
```

---

### Task 11: Mirror rail client

**Files:**

- Create: `packages/extensions/terminal/src/client/mirror-rail.tsx`
- Modify: `packages/extensions/terminal/src/client/terminal-panel-view.tsx`
- Modify: `packages/extensions/terminal/package.json` (add `"@conciv/ui-kit-chat-tools": "workspace:*"` if tool summaries used)
- Test: widget IT (Task 12) asserts a mirror card appears during a live turn

**Interfaces:**

- Consumes: `GET /mirror` SSE (Task 10), `TerminalPrimitive.Overlay` / styled `Terminal` (Task 8), `inlineValue`/`shortenPath` from `@conciv/ui-kit-chat-tools`.
- Produces: `<MirrorRail apiBase headers />` — collapsible rail (default collapsed; toggle button labeled "Activity") rendering read-only entries: text parts as prose, thinking dimmed, tool-call parts as compact cards (name + `inlineValue` summary of parsed arguments), tool-results folded into their call card state.

- [ ] **Step 1: SSE consumption** — fetch-based reader (EventSource cannot send the session header):

```ts
export function connectMirror(
  url: string,
  headers: Record<string, string>,
  onMessages: (messages: UIMessage[]) => void,
): () => void {
  const controller = new AbortController()
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const res = await fetch(url, {credentials: 'include', headers, signal: controller.signal})
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        const state = {buffer: ''}
        for (;;) {
          const {done, value} = await reader.read()
          if (done) break
          state.buffer += decoder.decode(value, {stream: true})
          const events = state.buffer.split('\n\n')
          state.buffer = events.pop() ?? ''
          for (const eventBlock of events) {
            const data = eventBlock
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('')
            if (!data) continue
            try {
              const parsed: {messages: UIMessage[]} = JSON.parse(data)
              onMessages(parsed.messages)
            } catch {}
          }
        }
      } catch {}
      if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  })()
  return () => controller.abort()
}
```

(Reconnect loop doubles as the spec's mirror-drop recovery; each reconnect re-receives the full snapshot, so no cursor needed.)

- [ ] **Step 2: Rail component** — same file, below `connectMirror`:

```tsx
type ToolResultInfo = {state: string}

function resultsById(messages: UIMessage[]): Map<string, ToolResultInfo> {
  const map = new Map<string, ToolResultInfo>()
  for (const message of messages)
    for (const part of message.parts) if (part.type === 'tool-result') map.set(part.toolCallId, {state: part.state})
  return map
}

function argumentSummary(raw: string): string {
  try {
    return inlineValue(JSON.parse(raw))
  } catch {
    return ''
  }
}

const RAIL = 'flex flex-col min-h-0 w-70 border-l border-pw-line bg-pw-panel'
const RAIL_HEAD =
  'flex items-center justify-between px-2.5 py-1.5 border-b border-pw-line-soft text-[0.6875rem] font-semibold text-pw-text-2'
const ENTRY_TEXT = 'text-[0.75rem] text-pw-text px-2.5 py-1 [word-break:break-word]'
const ENTRY_THINKING = 'text-[0.75rem] text-pw-text-3 italic px-2.5 py-1 [word-break:break-word]'
const TOOL_ROW = 'flex items-center gap-1.5 text-[0.71875rem] text-pw-text-2 px-2.5 py-1 font-pw-mono'

function MirrorEntry(props: {part: MessagePart; results: Map<string, ToolResultInfo>}): JSX.Element {
  const part = props.part
  if (part.type === 'text') return <p class={ENTRY_TEXT}>{part.content}</p>
  if (part.type === 'thinking') return <p class={ENTRY_THINKING}>{part.content}</p>
  if (part.type !== 'tool-call') return null
  const result = () => props.results.get(part.id)
  return (
    <div class={TOOL_ROW}>
      <span
        class="rounded-[50%] shrink-0 size-1.75"
        classList={{
          'bg-pw-success': result()?.state === 'complete',
          'bg-pw-danger': result()?.state === 'error',
          'bg-pw-text-3': !result(),
        }}
        aria-hidden="true"
      />
      <span class="font-semibold shrink-0">{part.name}</span>
      <span class="truncate text-pw-text-3">{argumentSummary(part.arguments)}</span>
    </div>
  )
}

export function MirrorRail(props: {apiBase: string; headers: () => Record<string, string>}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [messages, setMessages] = createSignal<UIMessage[]>([])
  onMount(() => {
    const stop = connectMirror(`${props.apiBase}/api/ext/terminal/mirror`, props.headers(), setMessages)
    onCleanup(stop)
  })
  const results = createMemo(() => resultsById(messages()))
  return (
    <div classList={{[RAIL]: open(), 'flex flex-col': !open()}}>
      <button
        type="button"
        class="text-[0.6875rem] font-semibold text-pw-text-2 px-2 py-1.5 bg-transparent [border:none] cursor-pointer hover:text-pw-text-hi"
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        Activity
      </button>
      <Show when={open()}>
        <div class={RAIL_HEAD}>
          <span>Activity</span>
          <span class="text-pw-text-3">{messages().length}</span>
        </div>
        <div class="flex-1 overflow-y-auto py-1" role="log" aria-label="Terminal activity">
          <For each={messages()}>
            {(message) => <For each={message.parts}>{(part) => <MirrorEntry part={part} results={results()} />}</For>}
          </For>
        </div>
      </Show>
    </div>
  )
}
```

Imports for the file: `createMemo, createSignal, For, onCleanup, onMount, Show, type JSX` from `solid-js`; `type MessagePart, type UIMessage` from `@conciv/protocol/chat-types`; `inlineValue` from `@conciv/ui-kit-chat-tools`. Adjust `MessagePart` narrowing to the actual union member fields (`tool-result` has `toolCallId`/`state`; `tool-call` has `id`/`name`/`arguments` — see `packages/harness/src/claude/history.ts:44-64` for the produced shapes). Solid components must not early-return conditionals on reactive props — `MirrorEntry` receives a stable `part` per `<For>` row, so the guards are safe here.

- [ ] **Step 3: Mount in the view** — wrap the styled `Terminal` and the rail in a row; rail toggle in the rail header; `connectMirror` started in `onMount`, stopped in `onCleanup`, messages in a signal.

- [ ] **Step 4: Build + typecheck**

Run: `pnpm turbo build --filter=@conciv/extension-terminal && pnpm turbo typecheck --filter=@conciv/extension-terminal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/terminal/src packages/extensions/terminal/package.json pnpm-lock.yaml
git commit -m "feat(terminal): live mirror rail rendering transcript entries" -- packages/extensions/terminal/src packages/extensions/terminal/package.json pnpm-lock.yaml
```

---

### Task 12: Widget IT — full loop

**Files:**

- Modify: the existing terminal widget IT in `packages/widget/test/` (the real-claude terminal loop test added by the terminal extension work)

**Interfaces:** consumes everything above through the real widget.

- [ ] **Step 1: Rebuild deps** — `pnpm turbo build --filter=@conciv/extension-terminal --filter=@conciv/core --filter=@conciv/extension --filter=@conciv/ui-kit-terminal`

- [ ] **Step 2: Extend the IT** with, in order (one browser session, real claude):
  1. Open Terminal tab → action row visible: `getByRole('button', {name: 'Start a new session'})`, `getByRole('button', {name: 'Open externally'})`.
  2. Model chip: open selector, pick a different enabled model → terminal respawns (screen clears then TUI banner reappears) — assert via the terminal buffer helper (`element.__concivTerminal.buffer()`) containing the picked model's display name.
  3. Grab flow: stage a grab through the page picker helper used by existing grab ITs → tray card visible above terminal (`getByRole('button', {name: 'Insert'})`) → Insert → buffer contains the grab text prefix.
  4. Type a short prompt + Enter → while busy, expand mirror rail ("Activity") → a tool/text entry appears before the turn ends (incremental transcript, verified fact).
  5. New session action → buffer shows a fresh TUI banner; session pill label resets.
  6. Back to chat → history rehydrated (turn text visible in chat).

- [ ] **Step 3: Run**

Run: `pnpm --filter @conciv/widget test` (or the exact CI form: `pnpm turbo test --filter=@conciv/widget`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/test
git commit -m "test(widget): terminal augmentation full-loop IT" -- packages/widget/test
```

---

### Task 13: Docs + memory sync

- [ ] Update `docs/superpowers/specs/2026-07-04-terminal-view-augmentation-design.md` status line to `implemented` once Task 12 is green.
- [ ] Commit: `git commit -m "docs: mark terminal augmentation spec implemented" -- docs/superpowers/specs/2026-07-04-terminal-view-augmentation-design.md`
