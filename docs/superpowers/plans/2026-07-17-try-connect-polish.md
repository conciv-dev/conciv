# Try/Connect Flow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branded, stateful CLI output for `npx @conciv/try` (clack-style, with browser-pair feedback) and a guided-steps waiting panel on conciv.dev.

**Architecture:** Core gains a one-shot `onClientRequest` hook fired on the first token-authenticated request. `runConnect` swaps its `log` string callback for a typed `onEvent` (`seeded` → `started` → `client-connected`); the CLI layers presentation on top — clack UI on a TTY, plain greppable lines otherwise. The site panel derives numbered step states from two booleans (`copied`, `connected`) via a pure function, and `TryWidget` gains a short `connected` flash phase before handing off to the widget.

**Tech Stack:** TypeScript strict/NodeNext, Hono, citty, @clack/prompts (new dep, approved), React (site), vitest, Playwright (site e2e).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-try-connect-polish-design.md`.
- Zero code comments in TS/JS; no classes; no IIFEs; no `any`/`as`/non-null `!`; no `else` where guard clauses work.
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Build via turbo, never hand-rebuild dist. `pnpm test` builds first.
- Commit with pathspec (`git commit -- <paths>`), never push.
- Plain CLI output MUST keep the exact line `connected: conciv core on 127.0.0.1:<port> (harness: <id>)` — the `/pair/<token>` page tells agents to watch for "connected".
- Site panel keeps `aria-label="Try conciv live"` (e2e depends on it).
- v0: breaking `ConnectOpts` (removing `log`) is fine; update all call sites.

---

### Task 1: Core `onClientRequest` hook

**Files:**

- Modify: `packages/core/src/start.ts` (StartOpts at :15-28, token mount at :80)
- Test: `packages/core/test/client-request-hook.test.ts` (create)

**Interfaces:**

- Produces: `StartOpts.onClientRequest?: () => void` — invoked exactly once, on the first request hitting the token-mounted app. Only meaningful when `accessToken` is set.

- [ ] **Step 1: Write the failing test**

```ts
import {test, expect} from 'vitest'
import {start} from '../src/start.js'

test('onClientRequest fires once on the first token request', async () => {
  let fired = 0
  const engine = await start({
    options: {harnessBin: 'true'},
    root: process.cwd(),
    launchEditor: () => {},
    accessToken: 'tok-hook',
    onClientRequest: () => {
      fired += 1
    },
  })
  expect(fired).toBe(0)
  await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
  await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
  expect(fired).toBe(1)
  await engine.stop()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core exec vitest run test/client-request-hook.test.ts`
Expected: FAIL — TS error / unknown property `onClientRequest` (typecheck) or hook never fires.

- [ ] **Step 3: Implement**

In `packages/core/src/start.ts`, add to `StartOpts` (after `accessToken?: string`):

```ts
  onClientRequest?: () => void
```

Add above `start()`:

```ts
function onceNotifier(callback?: () => void): () => void {
  let fired = false
  return () => {
    if (fired || !callback) return
    fired = true
    callback()
  }
}
```

Replace the `served` line (`start.ts:80`):

```ts
const notifyClient = onceNotifier(opts.onClientRequest)
const served = opts.accessToken
  ? new Hono()
      .use(async (_context, next) => {
        notifyClient()
        await next()
      })
      .mount(`/t/${opts.accessToken}`, app.fetch)
  : app
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/core exec vitest run test/client-request-hook.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm turbo run typecheck --filter=@conciv/core
git add packages/core/src/start.ts packages/core/test/client-request-hook.test.ts
git commit -m "feat(core): onClientRequest hook fires once on first token request" -- packages/core/src/start.ts packages/core/test/client-request-hook.test.ts
```

---

### Task 2: `runConnect` typed events (`onEvent` replaces `log`)

**Files:**

- Modify: `packages/try/src/connect.ts`
- Test: `packages/try/test/connect.it.test.ts` (append one test)

**Interfaces:**

- Consumes: `StartOpts.onClientRequest` from Task 1.
- Produces:

```ts
export type ConnectEvent =
  | {type: 'seeded'; seeded: boolean}
  | {type: 'started'; port: number; harness: string}
  | {type: 'client-connected'}
```

and `ConnectOpts.onEvent?: (event: ConnectEvent) => void` (the `log` field is REMOVED — no other in-repo caller passes `log` except `bin.ts`, rewritten in Task 3).

- [ ] **Step 1: Write the failing test**

Append to `packages/try/test/connect.it.test.ts` (add `ConnectEvent` to the existing `runConnect` import; `until` is already imported from `@conciv/harness-testkit`):

```ts
it('emits seeded, started, then client-connected on the first token request', async () => {
  const events: ConnectEvent[] = []
  const engine = await runConnect({
    token: 'tok-events',
    harnessAdapter: createFakeHarness({id: 'fake-events'}),
    origin: 'http://127.0.0.1:1',
    onEvent: (event) => events.push(event),
  })
  engines.push(engine)
  expect(events).toEqual([
    {type: 'seeded', seeded: false},
    {type: 'started', port: engine.port, harness: 'fake-events'},
  ])
  await fetch(`http://127.0.0.1:${engine.port}/t/tok-events/health`)
  await until(() => events.length === 3)
  expect(events[2]).toEqual({type: 'client-connected'})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/try exec vitest run test/connect.it.test.ts -t 'emits seeded'`
Expected: FAIL — `onEvent` unknown / events array empty.

- [ ] **Step 3: Implement**

In `packages/try/src/connect.ts`:

Add the `ConnectEvent` type export (above `ConnectOpts`), replace `log?: (line: string) => void` with `onEvent?: (event: ConnectEvent) => void` in `ConnectOpts`, then rewrite `runConnect`:

```ts
export async function runConnect(opts: ConnectOpts): Promise<Engine> {
  const adapter = resolveAdapter(opts)
  const root = resolveWorkspace(opts.workspace)
  const onEvent = opts.onEvent ?? (() => {})
  if (opts.workspace === undefined) {
    const seeded = await seedWorkspace(opts.origin ?? DEFAULT_ORIGIN, root)
    onEvent({type: 'seeded', seeded})
  }
  let lastError: unknown
  for (let port = CONNECT_FIRST_PORT; port <= CONNECT_LAST_PORT; port += 1) {
    try {
      const engine = await start({
        options: {harness: adapter.id, stateRoot: root, systemPrompt: CONNECT_SYSTEM_PROMPT},
        root,
        port,
        launchEditor: () => {},
        harness: adapter,
        extensions: [terminal],
        accessToken: opts.token,
        allowedOrigins: [opts.origin ?? DEFAULT_ORIGIN],
        onClientRequest: () => onEvent({type: 'client-connected'}),
      })
      onEvent({type: 'started', port: engine.port, harness: adapter.id})
      return engine
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      lastError = error
    }
  }
  throw new Error(`no free port between ${CONNECT_FIRST_PORT} and ${CONNECT_LAST_PORT}: ${String(lastError)}`)
}
```

`bin.ts` still references `log` and now breaks the typecheck — that is expected until Task 3; run only the vitest file here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/try exec vitest run test/connect.it.test.ts`
Expected: all tests PASS (existing ones never passed `log`).

- [ ] **Step 5: Commit**

```bash
git add packages/try/src/connect.ts packages/try/test/connect.it.test.ts
git commit -m "feat(try): typed connect events replace log callback" -- packages/try/src/connect.ts packages/try/test/connect.it.test.ts
```

---

### Task 3: CLI presentation (clack UI + plain fallback + warning suppression + SIGINT)

**Files:**

- Create: `packages/try/src/cli.ts`
- Modify: `packages/try/src/bin.ts` (full rewrite)
- Modify: `packages/try/package.json` (add dependency)
- Test: `packages/try/test/cli.test.ts` (create)

**Interfaces:**

- Consumes: `runConnect`, `ConnectEvent` from Task 2.
- Produces: `plainLines(event: ConnectEvent): string[]` (exported for tests), `runCli(): void`.

- [ ] **Step 1: Add the dependency (approved)**

```bash
pnpm --filter @conciv/try add @clack/prompts
```

- [ ] **Step 2: Write the failing test**

`packages/try/test/cli.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {plainLines} from '../src/cli.js'

describe('plainLines', () => {
  it('keeps the greppable connected line for agent-driven runs', () => {
    expect(plainLines({type: 'started', port: 4732, harness: 'claude'})).toEqual([
      'connected: conciv core on 127.0.0.1:4732 (harness: claude)',
      'return to your browser tab — keep this command running',
    ])
  })
  it('renders both seed outcomes', () => {
    expect(plainLines({type: 'seeded', seeded: true})).toEqual(['workspace seeded with the landing-page source'])
    expect(plainLines({type: 'seeded', seeded: false})).toEqual(['no source manifest found — continuing unseeded'])
  })
  it('announces browser pairing', () => {
    expect(plainLines({type: 'client-connected'})).toEqual(['browser paired — the widget is live'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/try exec vitest run test/cli.test.ts`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 4: Implement `cli.ts`**

```ts
import {intro, log, note, outro, spinner} from '@clack/prompts'
import {defineCommand, runMain} from 'citty'
import {runConnect, type ConnectEvent} from './connect.js'

export function plainLines(event: ConnectEvent): string[] {
  if (event.type === 'seeded') {
    return [
      event.seeded ? 'workspace seeded with the landing-page source' : 'no source manifest found — continuing unseeded',
    ]
  }
  if (event.type === 'started') {
    return [
      `connected: conciv core on 127.0.0.1:${event.port} (harness: ${event.harness})`,
      'return to your browser tab — keep this command running',
    ]
  }
  return ['browser paired — the widget is live']
}

function plainUi(): (event: ConnectEvent) => void {
  return (event) => plainLines(event).forEach((line) => process.stdout.write(line + '\n'))
}

function clackUi(): (event: ConnectEvent) => void {
  intro('conciv — live connect')
  const seedSpinner = spinner()
  seedSpinner.start('Preparing workspace')
  let waitSpinner: ReturnType<typeof spinner> | undefined
  return (event) => {
    if (event.type === 'seeded') {
      seedSpinner.stop(
        event.seeded
          ? 'Workspace ready — seeded with the conciv.dev landing source'
          : 'Workspace ready — no source manifest found, continuing unseeded',
      )
      return
    }
    if (event.type === 'started') {
      log.success(`conciv core running on 127.0.0.1:${event.port} (harness: ${event.harness})`)
      note('Return to conciv.dev — Chrome will ask to allow\nlocal network access. Approve it.', 'Next')
      waitSpinner = spinner()
      waitSpinner.start('Waiting for your browser…')
      return
    }
    waitSpinner?.stop('Browser paired ✓ — the widget is live')
    log.info('Keep this running. Ctrl+C disconnects.')
  }
}

const main = defineCommand({
  meta: {name: 'conciv-try', description: 'try conciv live on conciv.dev with the agent on this machine'},
  args: {
    token: {type: 'string', required: true, description: 'pairing token from conciv.dev'},
    harness: {type: 'string', description: 'claude (default), codex, gemini-cli, opencode or pi'},
    workspace: {type: 'string', description: 'pass "." to use the current directory (default: throwaway temp dir)'},
    origin: {type: 'string', description: 'override the allowed browser origin (testing only)'},
  },
  run: async ({args}) => {
    const interactive = process.stdout.isTTY === true
    const onEvent = interactive ? clackUi() : plainUi()
    const engine = await runConnect({
      token: args.token,
      harness: args.harness,
      workspace: args.workspace,
      origin: args.origin,
      onEvent,
    })
    process.on('SIGINT', () => {
      void engine.stop().finally(() => {
        if (interactive) outro('Disconnected')
        process.exit(0)
      })
    })
    await new Promise(() => {})
  },
})

export function runCli(): void {
  void runMain(main)
}
```

- [ ] **Step 5: Rewrite `bin.ts`**

```ts
#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import {runCli} from './cli.js'

runCli()
```

The `env -S` shebang suppresses the `node:sqlite` ExperimentalWarning on macOS/Linux (BSD and coreutils env both support `-S`; node >= 22 supports `--disable-warning`). Windows npm shims ignore shebang flags — Windows users see the one warning line; accepted.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `pnpm --filter @conciv/try exec vitest run && pnpm turbo run typecheck build --filter=@conciv/try`
Expected: PASS; build output `dist/bin.js` starts with the new shebang (`head -1 packages/try/dist/bin.js`).

- [ ] **Step 7: Manual smoke (TTY path)**

Run: `node packages/try/dist/bin.js --token smoke-test --origin http://127.0.0.1:1`
Expected: clack intro, "Workspace ready — no source manifest found…", core-running success line, note box, waiting spinner. Ctrl+C prints "Disconnected" outro and exits 0. No ExperimentalWarning line.

- [ ] **Step 8: Commit**

```bash
git add packages/try/src/cli.ts packages/try/src/bin.ts packages/try/package.json packages/try/test/cli.test.ts pnpm-lock.yaml
git commit -m "feat(try): clack-styled CLI with browser-pair feedback and plain non-TTY fallback" -- packages/try/src/cli.ts packages/try/src/bin.ts packages/try/package.json packages/try/test/cli.test.ts pnpm-lock.yaml
```

---

### Task 4: Site step model + `CopyButton.onCopy`

**Files:**

- Create: `apps/site/src/lib/try-steps.ts`
- Modify: `apps/site/src/components/landing/copy-button.tsx` (Root props)
- Test: `apps/site/test/try-steps.test.ts` (create)

**Interfaces:**

- Produces:

```ts
export type TryStep = 'copy' | 'run' | 'approve'
export type StepState = 'pending' | 'active' | 'done'
export function stepStates(opts: {copied: boolean; connected: boolean}): Record<TryStep, StepState>
```

and `CopyButton.Root` accepts optional `onCopy?: () => void`.

- [ ] **Step 1: Write the failing test**

`apps/site/test/try-steps.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {stepStates} from '../src/lib/try-steps'

describe('stepStates', () => {
  it('starts with copy active', () => {
    expect(stepStates({copied: false, connected: false})).toEqual({copy: 'active', run: 'pending', approve: 'pending'})
  })
  it('advances to run after copying', () => {
    expect(stepStates({copied: true, connected: false})).toEqual({copy: 'done', run: 'active', approve: 'pending'})
  })
  it('marks everything done on connect, even without a copy click', () => {
    expect(stepStates({copied: false, connected: true})).toEqual({copy: 'done', run: 'done', approve: 'done'})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter site exec vitest run test/try-steps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `try-steps.ts`**

```ts
export type TryStep = 'copy' | 'run' | 'approve'
export type StepState = 'pending' | 'active' | 'done'

export function stepStates(opts: {copied: boolean; connected: boolean}): Record<TryStep, StepState> {
  if (opts.connected) return {copy: 'done', run: 'done', approve: 'done'}
  if (opts.copied) return {copy: 'done', run: 'active', approve: 'pending'}
  return {copy: 'active', run: 'pending', approve: 'pending'}
}
```

- [ ] **Step 4: Add `onCopy` to `CopyButton.Root`**

In `copy-button.tsx`, change the `Root` signature and `copy` handler:

```tsx
function Root({text, onCopy, children}: {text: string; onCopy?: () => void; children: ReactNode}) {
```

and inside `copy` (first lines):

```tsx
  const copy = () => {
    void navigator.clipboard.writeText(text)
    onCopy?.()
```

(rest unchanged).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter site exec vitest run test/try-steps.test.ts && pnpm turbo run typecheck --filter=site`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/lib/try-steps.ts apps/site/src/components/landing/copy-button.tsx apps/site/test/try-steps.test.ts
git commit -m "feat(site): try-flow step state model and CopyButton onCopy" -- apps/site/src/lib/try-steps.ts apps/site/src/components/landing/copy-button.tsx apps/site/test/try-steps.test.ts
```

---

### Task 5: TryPanel guided steps + TryWidget connected flash

**Files:**

- Modify: `apps/site/src/components/landing/try-panel.tsx` (rewrite body)
- Modify: `apps/site/src/components/landing/try-widget.tsx` (phase machine, overlay props)
- Modify: `apps/site/test/live-connect.it.test.ts` (one timeout)

**Interfaces:**

- Consumes: `stepStates`, `CopyButton.Root onCopy` from Task 4.
- Produces: `TryPanel({token, connected, onClose}: {token: string; connected: boolean; onClose: () => void})`.

- [ ] **Step 1: Rewrite `try-panel.tsx`**

Keep: `ORIGIN`, `SLOW_HINT_MS`, `claimStagger`/`Item` stagger helpers, the outer `<section>` shell classes and `aria-label="Try conciv live"`, header, footer, slow-timer ref callback. Replace the body content:

```tsx
import {Check, X} from 'lucide-react'
import {useCallback, useRef, useState, type ReactNode} from 'react'
import {stepStates, type StepState, type TryStep} from '@/lib/try-steps'
import {CopyButton} from './copy-button'
```

`CopyRow` gains a pass-through `onCopy`:

```tsx
function CopyRow({label, text, onCopy}: {label: string; text: string; onCopy: () => void}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[12.5px]">
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <CopyButton.Root text={text} onCopy={onCopy}>
        <CopyButton.Trigger label={label} />
        <CopyButton.Feedback />
      </CopyButton.Root>
    </div>
  )
}
```

Step primitives:

```tsx
const STEP_TITLES: Record<TryStep, string> = {
  copy: 'Copy the agent prompt',
  run: 'Run it in your terminal',
  approve: "Approve Chrome's local-network prompt",
}

function StepMarker({index, state}: {index: number; state: StepState}) {
  if (state === 'done') {
    return (
      <span className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3" aria-hidden />
      </span>
    )
  }
  return (
    <span
      data-state={state}
      className="inline-grid size-5 shrink-0 place-items-center rounded-full border text-[11px] text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary"
    >
      {index}
    </span>
  )
}

function Step({index, state, title, children}: {index: number; state: StepState; title: string; children?: ReactNode}) {
  return (
    <li className="flex gap-3" data-state={state}>
      <StepMarker index={index} state={state} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[13px] font-semibold data-[state=pending]:text-muted-foreground" data-state={state}>
          {title}
        </p>
        {children}
      </div>
    </li>
  )
}
```

Panel body (inside the existing scroll container, `Item` stagger wrappers kept with orders 0..4):

```tsx
export function TryPanel({token, connected, onClose}: {token: string; connected: boolean; onClose: () => void}) {
  const [stagger] = useState(claimStagger)
  const [copied, setCopied] = useState(false)
  const [slow, setSlow] = useState(false)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const slowTimer = useCallback((node: HTMLElement | null) => {
    if (node) {
      slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_HINT_MS)
      return
    }
    clearTimeout(slowTimerRef.current)
  }, [])
  const states = stepStates({copied, connected})
  const markCopied = () => setCopied(true)

  return (
    <section ref={slowTimer} aria-label="Try conciv live" className={/* unchanged shell classes */}>
      {/* header unchanged */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Item stagger={stagger} order={0}>
          <p className="text-[15px] font-semibold">Drive this page with your agent.</p>
        </Item>
        <Item stagger={stagger} order={1}>
          <p className="text-[13px] text-muted-foreground">
            Your coding agent connects from <b className="font-semibold text-foreground">your</b> machine and takes the
            wheel — nothing to sign up for.
          </p>
        </Item>
        <Item stagger={stagger} order={2}>
          <ol className="flex flex-col gap-4">
            <Step index={1} state={states.copy} title={STEP_TITLES.copy}>
              <CopyRow
                label="Copy agent prompt"
                text={`Read ${ORIGIN}/pair/${token} and follow the instructions`}
                onCopy={markCopied}
              />
              <details>
                <summary className="cursor-pointer text-[12.5px] text-muted-foreground">or run it yourself</summary>
                <div className="mt-2">
                  <CopyRow label="Copy connect command" text={`npx @conciv/try --token ${token}`} onCopy={markCopied} />
                </div>
              </details>
            </Step>
            <Step index={2} state={states.run} title={STEP_TITLES.run}>
              <p className="text-[12.5px] text-muted-foreground">First run installs the package (~30s).</p>
            </Step>
            <Step index={3} state={states.approve} title={STEP_TITLES.approve}>
              <p className="text-[12.5px] text-muted-foreground">
                Chrome asks to allow local network access — that&apos;s your agent connecting. Approve it.
              </p>
            </Step>
          </ol>
        </Item>
        {connected ? (
          <p role="status" className="mt-auto flex items-center gap-2 text-[13px] font-semibold text-primary">
            <Check className="size-4" aria-hidden /> Agent connected
          </p>
        ) : (
          <p className="mt-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            waiting for your agent…
          </p>
        )}
        {slow && !connected ? (
          <p className="text-[12px] text-muted-foreground">
            Taking a while? See the{' '}
            <a href="/docs" className="underline underline-offset-2">
              quickstart
            </a>{' '}
            for setup help.
          </p>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          Everything stays on your machine — prompts, code, and page snapshots never touch our servers.
        </p>
      </div>
      {/* footer unchanged */}
    </section>
  )
}
```

- [ ] **Step 2: Add the connected flash phase to `try-widget.tsx`**

Change the phase union and poll loop:

```ts
type Phase = 'boot' | 'waiting' | 'connected' | 'live'

const CONNECTED_FLASH_MS = 800
```

```ts
async function pollForCore(token: string, signal: AbortSignal, onPhase: (phase: Phase) => void): Promise<void> {
  while (!signal.aborted) {
    await sleep(POLL_INTERVAL_MS, signal)
    const base = signal.aborted ? null : await probe(token, signal)
    if (!base) continue
    onPhase('connected')
    mountWidget(base)
    await sleep(CONNECTED_FLASH_MS, signal)
    onPhase('live')
    return
  }
}
```

The preflight path in `beginSession` stays as-is (straight to `live`, no flash).

`TryOverlay` and render wiring — pass `connected` through:

```tsx
function TryOverlay({
  open,
  token,
  connected,
  onClose,
  onOpen,
}: {
  open: boolean
  token: string
  connected: boolean
  onClose: () => void
  onOpen: () => void
}) {
  if (!open || !token) return <TryLauncher label="Open the live demo panel" onActivate={onOpen} />
  return (
    <>
      <TryLauncher label="Hide the live demo panel" onActivate={onClose} />
      <TryPanel token={token} connected={connected} onClose={onClose} />
    </>
  )
}
```

and in `TryWidget`'s return:

```tsx
if (hidden || phase === 'live') return null
return (
  <div ref={start}>
    {phase === 'waiting' || phase === 'connected' ? (
      <TryOverlay
        open={search.try === 1}
        token={token}
        connected={phase === 'connected'}
        onClose={closePanel}
        onOpen={openPanel}
      />
    ) : null}
  </div>
)
```

- [ ] **Step 3: Update the e2e panel-hide assertion**

In `apps/site/test/live-connect.it.test.ts`, the flash keeps the panel visible ~800ms after the widget mounts; give the hide-poll headroom:

```ts
await expect.poll(() => panel.isVisible(), {timeout: 5_000}).toBe(false)
```

(The `npx @conciv/try --token` token-extraction locator still works: `<details>` content stays in the DOM and `textContent()` does not require visibility.)

- [ ] **Step 4: Typecheck + unit tests**

Run: `pnpm turbo run typecheck --filter=site && pnpm --filter site exec vitest run`
Expected: PASS

- [ ] **Step 5: Run the site e2e**

Run: `pnpm turbo run test:e2e --filter=site`
Expected: PASS — pairs, flashes "Agent connected", mounts widget, completes chat turn. (Needs `@conciv/embed` + site build; turbo handles via dependsOn.)

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/components/landing/try-panel.tsx apps/site/src/components/landing/try-widget.tsx apps/site/test/live-connect.it.test.ts
git commit -m "feat(site): guided-steps try panel with connected flash" -- apps/site/src/components/landing/try-panel.tsx apps/site/src/components/landing/try-widget.tsx apps/site/test/live-connect.it.test.ts
```

---

### Task 6: Changeset + full gates

**Files:**

- Create: `.changeset/try-connect-polish.md`

- [ ] **Step 1: Write the changeset**

```md
---
'@conciv/try': patch
---

Polished connect flow: clack-styled CLI output with browser-pair feedback (new core `onClientRequest` hook), plain greppable lines for agent-driven runs, and a guided-steps waiting panel on conciv.dev.
```

(All `@conciv/*` versions are fixed — one entry bumps the set, covering the core change.)

- [ ] **Step 2: Full gates (forced, cache masks regressions)**

```bash
pnpm typecheck && pnpm build && pnpm exec turbo run test --force
```

Expected: all green.

- [ ] **Step 3: Fallow audit**

```bash
pnpm exec fallow audit --changed-since main --format json
```

Expected: nothing INTRODUCED. If `plainLines` or `ConnectEvent` are flagged unused-export, they are public via tests/package exports — verify with `pnpm exec fallow dead-code --trace 'packages/try/src/cli.ts:plainLines'` before touching.

- [ ] **Step 4: Commit**

```bash
git add .changeset/try-connect-polish.md
git commit -m "chore: changeset for try/connect flow polish" -- .changeset/try-connect-polish.md
```

---

## Verification (whole feature)

1. `node packages/try/dist/bin.js --token demo --origin http://127.0.0.1:1` in a real terminal — branded output, spinner waits, Ctrl+C outro.
2. `node packages/try/dist/bin.js --token demo --origin http://127.0.0.1:1 | cat` — plain lines, `connected:` grep-able, no ANSI.
3. Site e2e green (Task 5 step 5) — covers panel → connect → flash → widget handoff end to end.
