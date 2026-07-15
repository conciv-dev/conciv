# Widget-First Connect UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The landing page opens with a widget-shaped "try it live" panel already open bottom-right; connecting an agent hands off to the real widget with its panel open in the same spot.

**Architecture:** Everything lives in `apps/site` — a stand-in panel (`TryPanel`) plus launcher bubble (`TryLauncher`) orchestrated by `TryWidget`, driven by a `?try=1` search param on the index route. On connect, the site seeds the widget's navigation history over the core's public rpc (`sessions.resolve` → `navigation.set`) so the real widget boots with its panel open, then injects the widget bundle. Core/embed/app/try packages are untouched.

**Tech Stack:** React 19 + TanStack Router (site), Tailwind v4 + `od-*` CSS conventions in `apps/site/src/styles/app.css`, `@conciv/contract` oRPC client, vitest (node) for units, Playwright + wrangler dev for ITs.

**Spec:** `docs/superpowers/specs/2026-07-15-widget-first-connect-design.md`

## Global Constraints

- Zero changes outside `apps/site` (core, embed, app, try, protocol all untouched).
- Code style: functions not classes, no IIFEs, ZERO comments, no `any`/`as`/non-null `!`, no semicolons/single quotes (oxfmt).
- No test-ids; Playwright asserts via roles/accessible names/text only.
- Motion rules: transitions not keyframes for open/close (interruptible), transform+opacity only, exits faster than entries, hover gated `@media (hover:hover) and (pointer:fine)`, `prefers-reduced-motion` = opacity-only.
- Widget ITs: `browser.newPage()`, `domcontentloaded` waits (never `networkidle`), prebuilt embed bundle.
- During UI tasks (4, 5, 7) load skills: `emil-design-eng`, `impeccable:animate`, `frontend-design`; task 7 ends with `impeccable:polish`.
- All commands run from the worktree root: `/Users/omrikatz/Public/web/aidx/.claude/worktrees/live-widget-connect`.
- Commit with pathspec: `git commit -- <paths>`.

---

### Task 1: Navigation seed helpers in `lib/connect-live.ts`

**Files:**
- Modify: `apps/site/src/lib/connect-live.ts`
- Modify: `apps/site/package.json` (add `"@conciv/contract": "workspace:*"` to `dependencies`)
- Test: `apps/site/test/try-connect.test.ts` (create)

**Interfaces:**
- Consumes: `makeRpcClient(apiBase)` from `@conciv/contract` (`packages/contract/src/client.ts:8`), `NavigationState` from `@conciv/protocol/chat-types`.
- Produces: `openPanelNavigation(sessionId: string): NavigationState` and `seedOpenPanel(base: string): Promise<void>`; `mountWidget` now dispatches `conciv:widget-mounted` on `window` after injecting the bundle script.

- [ ] **Step 1: Add the dependency**

In `apps/site/package.json` `dependencies`, alongside `"@conciv/protocol"`, add:

```json
"@conciv/contract": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing unit test**

Create `apps/site/test/try-connect.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {NavigationStateSchema} from '@conciv/protocol/chat-types'
import {openPanelNavigation} from '../src/lib/connect-live'

describe('openPanelNavigation', () => {
  it('produces a schema-valid single open-panel entry', () => {
    const state = openPanelNavigation('abc123')
    expect(NavigationStateSchema.parse(state)).toEqual(state)
    expect(state.entries).toEqual([{href: '/panel/abc123?open=true'}])
    expect(state.index).toBe(0)
  })
})
```

- [ ] **Step 3: Run it, verify it fails**

Run: `pnpm --filter @conciv/site exec vitest run test/try-connect.test.ts`
Expected: FAIL — `openPanelNavigation` is not exported. (If the site package has a different vitest invocation, mirror how `pair-route.test.ts` runs; check `apps/site/package.json` scripts.)

- [ ] **Step 4: Implement**

In `apps/site/src/lib/connect-live.ts`, add imports at top and functions at bottom:

```ts
import {makeRpcClient} from '@conciv/contract'
import type {NavigationState} from '@conciv/protocol/chat-types'
```

```ts
export function openPanelNavigation(sessionId: string): NavigationState {
  return {entries: [{href: `/panel/${sessionId}?open=true`}], index: 0}
}

export async function seedOpenPanel(base: string): Promise<void> {
  const rpc = makeRpcClient(base)
  const {sessionId} = await rpc.sessions.resolve({})
  await rpc.navigation.set(openPanelNavigation(sessionId))
}
```

And in the existing `mountWidget`, after `document.body.appendChild(script)`, add:

```ts
window.dispatchEvent(new Event('conciv:widget-mounted'))
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm --filter @conciv/site exec vitest run test/try-connect.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/lib/connect-live.ts apps/site/package.json pnpm-lock.yaml apps/site/test/try-connect.test.ts
git commit -m "feat(site): navigation seed helpers for widget-first connect" -- apps/site/src/lib/connect-live.ts apps/site/package.json pnpm-lock.yaml apps/site/test/try-connect.test.ts
```

---

### Task 2: Try-state decision logic

**Files:**
- Create: `apps/site/src/lib/try-state.ts`
- Test: `apps/site/test/try-connect.test.ts` (extend)

**Interfaces:**
- Produces: `TRY_DISMISSED_KEY = 'conciv-try-dismissed'`, `shouldAutoOpen(opts: {tryParam: boolean; dismissed: boolean; widgetPresent: boolean}): boolean`.

- [ ] **Step 1: Write the failing tests** (append to `apps/site/test/try-connect.test.ts`)

```ts
import {shouldAutoOpen} from '../src/lib/try-state'

describe('shouldAutoOpen', () => {
  it('opens on first visit', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: false, widgetPresent: false})).toBe(true)
  })
  it('stays closed after dismissal', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: true, widgetPresent: false})).toBe(false)
  })
  it('does nothing when the param is already present', () => {
    expect(shouldAutoOpen({tryParam: true, dismissed: false, widgetPresent: false})).toBe(false)
  })
  it('never opens when a widget is on the page', () => {
    expect(shouldAutoOpen({tryParam: false, dismissed: false, widgetPresent: true})).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify FAIL** (module not found)

- [ ] **Step 3: Implement** — create `apps/site/src/lib/try-state.ts`:

```ts
export const TRY_DISMISSED_KEY = 'conciv-try-dismissed'

export function shouldAutoOpen(opts: {tryParam: boolean; dismissed: boolean; widgetPresent: boolean}): boolean {
  return !opts.widgetPresent && !opts.tryParam && !opts.dismissed
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/try-state.ts apps/site/test/try-connect.test.ts
git commit -m "feat(site): try-panel auto-open decision logic" -- apps/site/src/lib/try-state.ts apps/site/test/try-connect.test.ts
```

---

### Task 3: `RobotFab` accepts an activation override

**Files:**
- Modify: `apps/site/src/components/landing/robot-fab.tsx`

**Interfaces:**
- Produces: `RobotFab({onActivate, label}: {onActivate?: () => void; label?: string})` — with no props, behavior is exactly today's (used in `how-it-works.tsx:96`); with `onActivate`, click calls it instead of toggling work-mode, and `label` overrides the aria-label.

- [ ] **Step 1: Implement** — in `robot-fab.tsx`, change the signature and `toggle`/aria-label:

```tsx
export function RobotFab({onActivate, label}: {onActivate?: () => void; label?: string} = {}) {
```

```tsx
  const toggle = () => {
    if (onActivate) return onActivate()
    const next = !working
    setWorking(next)
    rig.current?.apply(next ? 'work' : 'open')
  }
```

```tsx
      aria-label={label ?? (working ? 'Stop the robot thinking' : 'Make the robot think')}
```

Everything else (rig attach, enter/leave hover) stays as is.

- [ ] **Step 2: Verify** — `pnpm --filter @conciv/site typecheck` (or `pnpm typecheck` from root). Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/site/src/components/landing/robot-fab.tsx
git commit -m "feat(site): RobotFab activation override for launcher reuse" -- apps/site/src/components/landing/robot-fab.tsx
```

---

### Task 4: `TryPanel` + `TryLauncher` presentational components + motion CSS

Load skills `emil-design-eng`, `impeccable:animate`, `frontend-design` before this task.

**Files:**
- Create: `apps/site/src/components/landing/try-panel.tsx`
- Create: `apps/site/src/components/landing/try-launcher.tsx`
- Modify: `apps/site/src/styles/app.css` (append `od-try-*` styles)

**Interfaces:**
- Consumes: `CopyRow` needs `CopyButton` from `./copy-button` (same composition as the old `ConnectLive`); `RobotFab({onActivate, label})` from Task 3.
- Produces: `TryPanel({token, phase, stagger, onClose}: {token: string; phase: 'waiting' | 'going-live'; stagger: boolean; onClose: () => void})`, `TryLauncher({onOpen}: {onOpen: () => void})`.

- [ ] **Step 1: Create `try-panel.tsx`**

```tsx
import {X} from 'lucide-react'
import {useCallback, useState} from 'react'
import {CopyButton} from './copy-button'

const ORIGIN = 'https://conciv.dev'
const SLOW_HINT_MS = 60_000

function CopyRow({label, text}: {label: string; text: string}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[12.5px]">
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <CopyButton.Root text={text}>
        <CopyButton.Trigger label={label} />
        <CopyButton.Feedback />
      </CopyButton.Root>
    </div>
  )
}

export function TryPanel({
  token,
  phase,
  stagger,
  onClose,
}: {
  token: string
  phase: 'waiting' | 'going-live'
  stagger: boolean
  onClose: () => void
}) {
  const [slow, setSlow] = useState(false)
  const slowTimer = useCallback((node: HTMLElement | null) => {
    if (!node) return
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section
      ref={slowTimer}
      aria-label="Try conciv live"
      data-phase={phase}
      data-stagger={stagger}
      className="od-try-panel fixed bottom-[5.25rem] right-5 z-40 flex h-[35rem] max-h-[calc(100vh-7.5rem)] w-[30rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> conciv — live demo
        </span>
        <button
          type="button"
          aria-label="Close the live demo panel"
          onClick={onClose}
          className="inline-grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="od-try-body flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <p className="text-[14px]">
          No agent connected yet. Point <b className="font-semibold">your</b> coding agent at this page and it drives
          the widget for real — from your machine.
        </p>
        <p className="text-[13px] font-semibold">Paste into Claude Code (or any agent CLI):</p>
        <CopyRow label="Copy agent prompt" text={`Read ${ORIGIN}/pair/${token} and follow the instructions`} />
        <p className="text-[13px] text-muted-foreground">Or run it yourself:</p>
        <CopyRow label="Copy connect command" text={`npx @conciv/try --token ${token}`} />
        {phase === 'waiting' ? (
          <p className="mt-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            waiting for your agent… Chrome will ask to allow local network access — that&apos;s your agent connecting.
          </p>
        ) : (
          <p className="mt-auto flex items-center gap-2 text-[12.5px] font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            connected — going live…
          </p>
        )}
        {slow && phase === 'waiting' ? (
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
      <footer className="border-t p-3">
        <input
          type="text"
          disabled
          placeholder="Connect an agent to start chatting…"
          aria-label="Message input, disabled until an agent connects"
          className="w-full rounded-lg border bg-secondary px-3 py-2 text-[13px] disabled:opacity-60"
        />
      </footer>
    </section>
  )
}
```

Note: React callback refs returning a cleanup function is React 19 behavior — the site is React 19. If lint complains about the return from `slowTimer`, restructure to store the timer on a ref and clear in the `null` branch.

- [ ] **Step 2: Create `try-launcher.tsx`**

```tsx
import {RobotFab} from './robot-fab'

export function TryLauncher({onOpen}: {onOpen: () => void}) {
  return (
    <div className="od-try-launcher fixed bottom-5 right-5 z-40">
      <RobotFab onActivate={onOpen} label="Open the live demo panel" />
    </div>
  )
}
```

- [ ] **Step 3: Append motion CSS to `apps/site/src/styles/app.css`**

Follow the file's existing `od-*` conventions. Values come from the spec's motion table:

```css
.od-try-panel {
  transform-origin: bottom right;
  opacity: 1;
  transform: none;
  transition:
    opacity 220ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
@starting-style {
  .od-try-panel {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
}
.od-try-panel[data-phase='going-live'] .od-try-body {
  filter: blur(2px);
  opacity: 0.7;
  transition:
    filter 300ms cubic-bezier(0.77, 0, 0.175, 1),
    opacity 300ms cubic-bezier(0.77, 0, 0.175, 1);
}
.od-try-panel[data-stagger='true'] .od-try-body > * {
  animation: od-try-item 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards;
}
.od-try-panel[data-stagger='true'] .od-try-body > :nth-child(2) {
  animation-delay: 40ms;
}
.od-try-panel[data-stagger='true'] .od-try-body > :nth-child(3) {
  animation-delay: 80ms;
}
.od-try-panel[data-stagger='true'] .od-try-body > :nth-child(4) {
  animation-delay: 120ms;
}
.od-try-panel[data-stagger='true'] .od-try-body > :nth-child(n + 5) {
  animation-delay: 160ms;
}
@keyframes od-try-item {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.od-try-launcher {
  opacity: 1;
  transform: none;
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
@starting-style {
  .od-try-launcher {
    opacity: 0;
    transform: scale(0.95);
  }
}
@media (prefers-reduced-motion: reduce) {
  .od-try-panel,
  .od-try-launcher {
    transition-property: opacity;
  }
  @starting-style {
    .od-try-panel,
    .od-try-launcher {
      transform: none;
    }
  }
  .od-try-panel[data-stagger='true'] .od-try-body > * {
    animation: none;
  }
}
```

- [ ] **Step 4: Verify** — `pnpm typecheck` from root. Expected: clean. (Visual verification happens in Task 6's ITs and Task 7's polish pass.)

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/components/landing/try-panel.tsx apps/site/src/components/landing/try-launcher.tsx apps/site/src/styles/app.css
git commit -m "feat(site): try-panel and launcher stand-in components" -- apps/site/src/components/landing/try-panel.tsx apps/site/src/components/landing/try-launcher.tsx apps/site/src/styles/app.css
```

---

### Task 5: `TryWidget` orchestrator, URL wiring, hero swap, delete `ConnectLive`

Load skills `emil-design-eng`, `impeccable:animate`, `frontend-design` if not already loaded.

**Files:**
- Create: `apps/site/src/components/landing/try-widget.tsx`
- Modify: `apps/site/src/routes/index.tsx` (validateSearch)
- Modify: `apps/site/src/components/landing/landing-page.tsx` (render `TryWidget`)
- Modify: `apps/site/src/components/landing/hero.tsx` (swap `ConnectLive` → `TryLiveButton`)
- Delete: `apps/site/src/components/landing/connect-live.tsx`

**Interfaces:**
- Consumes: `findCore`, `mountWidget`, `seedOpenPanel`, `CONNECT_PORTS` from `@/lib/connect-live`; `shouldAutoOpen`, `TRY_DISMISSED_KEY` from `@/lib/try-state`; `TryPanel`, `TryLauncher` from Task 4.
- Produces: `TryWidget()` (renders the whole stand-in surface), `TryLiveButton()` (hero CTA), index route search type `{try?: 1}`.

- [ ] **Step 1: Wire the search param** — replace `apps/site/src/routes/index.tsx`:

```tsx
import {createFileRoute} from '@tanstack/react-router'
import {LandingPage} from '@/components/landing/landing-page'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): {try?: 1} => (search.try === 1 ? {try: 1} : {}),
  component: LandingPage,
})
```

- [ ] **Step 2: Create `try-widget.tsx`**

```tsx
import {useCallback, useRef, useState} from 'react'
import {getRouteApi} from '@tanstack/react-router'
import {CONNECT_PORTS, findCore, mountWidget, seedOpenPanel} from '@/lib/connect-live'
import {TRY_DISMISSED_KEY, shouldAutoOpen} from '@/lib/try-state'
import {TryLauncher} from './try-launcher'
import {TryPanel} from './try-panel'

type Phase = 'waiting' | 'going-live' | 'live'

const route = getRouteApi('/')
const GOING_LIVE_MS = 600

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function connectLoop(token: string, signal: AbortSignal, onPhase: (phase: Phase) => void): Promise<void> {
  while (!signal.aborted) {
    const base = await findCore(token, CONNECT_PORTS, (input, init) => fetch(input, init), signal)
    if (!base) {
      await sleep(2000, signal)
      continue
    }
    onPhase('going-live')
    await seedOpenPanel(base).catch((error: unknown) => console.error('conciv seed failed', error))
    await sleep(GOING_LIVE_MS, signal)
    mountWidget(base)
    onPhase('live')
    return
  }
}

export function TryWidget() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [token, setToken] = useState('')
  const [hidden, setHidden] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)

  const start = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      abortRef.current?.abort()
      abortRef.current = null
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    if (document.querySelector('[data-conciv-root]')) {
      setHidden(true)
      return
    }
    const freshToken = crypto.randomUUID()
    setToken(freshToken)
    const controller = new AbortController()
    abortRef.current = controller
    void connectLoop(freshToken, controller.signal, setPhase)
    const dismissed = localStorage.getItem(TRY_DISMISSED_KEY) === '1'
    if (shouldAutoOpen({tryParam: false, dismissed, widgetPresent: false})) {
      void navigate({search: {try: 1}, replace: true})
    }
  }, [])

  const close = () => {
    localStorage.setItem(TRY_DISMISSED_KEY, '1')
    void navigate({search: {}, replace: true})
  }
  const open = () => void navigate({search: {try: 1}})

  if (hidden || phase === 'live') return null
  const isOpen = search.try === 1
  if (isOpen && !everOpened) setEverOpened(true)

  return (
    <div ref={start}>
      {isOpen && token ? (
        <TryPanel token={token} phase={phase === 'going-live' ? 'going-live' : 'waiting'} stagger={!everOpened} onClose={close} />
      ) : (
        <TryLauncher onOpen={open} />
      )}
    </div>
  )
}

export function TryLiveButton() {
  const navigate = route.useNavigate()
  const [hidden, setHidden] = useState(false)
  const watch = useCallback((node: HTMLElement | null) => {
    if (!node) return
    if (document.querySelector('[data-conciv-root]')) setHidden(true)
    window.addEventListener('conciv:widget-mounted', () => setHidden(true), {once: true})
  }, [])

  if (hidden) return null
  return (
    <div ref={watch} className="mt-6">
      <button
        type="button"
        onClick={() => void navigate({search: {try: 1}})}
        className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13.5px] font-medium transition-[background-color,transform] duration-150 hover:bg-secondary active:scale-[0.97]"
      >
        <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Try it live — connect your agent
      </button>
    </div>
  )
}
```

Implementation notes for this step:
- `shouldAutoOpen` is called with `tryParam: false` because the callback ref fires once on first client mount; if the URL already has `?try=1` the navigate is a harmless no-op replace, but read `search.try` at call time if straightforward (the ref closure sees the initial value — acceptable either way).
- The setState-during-render for `everOpened` is the documented React pattern for derived state; if lint objects, move it into the `open` callback and the auto-open navigate.
- If the old `ConnectLive` used `Button` from `@/components/ui/button`, prefer reusing that component for `TryLiveButton` exactly as `connect-live.tsx` did: `<Button variant="outline" onClick={...}>`.

- [ ] **Step 3: Render `TryWidget` in `landing-page.tsx`** — add import and place it after `<SiteFooter />` inside the root div:

```tsx
import {TryWidget} from './try-widget'
```

```tsx
          <SiteFooter />
          <TryWidget />
```

- [ ] **Step 4: Swap the hero CTA** — in `hero.tsx`, replace the `ConnectLive` import and usage:

```tsx
import {TryLiveButton} from './try-widget'
```

```tsx
        <InstallChip />
        <TryLiveButton />
```

- [ ] **Step 5: Delete the old component**

```bash
git rm apps/site/src/components/landing/connect-live.tsx
```

- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm lint` from root. Expected: clean, no dangling `ConnectLive` references (grep to confirm: `grep -rn ConnectLive apps/site/src` → empty).

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/components/landing/try-widget.tsx apps/site/src/routes/index.tsx apps/site/src/components/landing/landing-page.tsx apps/site/src/components/landing/hero.tsx
git commit -m "feat(site): widget-first try panel opens on load, hero CTA slimmed" -- apps/site/src/components/landing/try-widget.tsx apps/site/src/routes/index.tsx apps/site/src/components/landing/landing-page.tsx apps/site/src/components/landing/hero.tsx apps/site/src/components/landing/connect-live.tsx
```

---

### Task 6: Integration tests

**Files:**
- Modify: `apps/site/test/live-connect.it.test.ts`

**Interfaces:**
- Consumes: the running site (wrangler dev, port 8787, existing `beforeAll`), `runConnect` from `@conciv/try`, `createFakeHarness` from `@conciv/harness-testkit`. Panel is `getByRole('region', {name: 'Try conciv live'})`; launcher/hero buttons by accessible name.

- [ ] **Step 1: Update the e2e for auto-open + open-panel handoff**

Replace the body of the existing `it('pairs, mounts the widget and completes a chat turn', ...)`:

```ts
    const page = await browser.newPage()
    await page.context().grantPermissions(['local-network-access'], {origin: `http://127.0.0.1:${SITE_PORT}`})
    await page.goto(`http://127.0.0.1:${SITE_PORT}`, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('region', {name: 'Try conciv live'})
    await expect.poll(() => panel.isVisible(), {timeout: 15_000}).toBe(true)
    expect(page.url()).toContain('try=1')
    const command = await page.getByText(/npx @conciv\/try --token/).textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: `http://127.0.0.1:${SITE_PORT}`,
    })
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => input.isVisible(), {timeout: 30_000}).toBe(true)
    await expect.poll(() => panel.isVisible()).toBe(false)
    const stamped = page.locator('[data-conciv-source]').first()
    const sourceRef = (await stamped.getAttribute('data-conciv-source')) ?? ''
    const sourceFile = sourceRef.split(':').slice(0, -2).join(':')
    expect(sourceFile).toMatch(/^src\//)
    expect(engine).not.toBeNull()
    if (engine) expect(existsSync(join(engine.cfg.stateRoot, sourceFile))).toBe(true)
    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(() => page.getByText('hello from e2e').first().isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
```

The two load-bearing changes: no `Try it live` click before pairing (auto-open), and no `Open conciv chat` click after connect (the seeded navigation boots the widget with the panel open — the message textbox must be reachable without any click).

- [ ] **Step 2: Add a UI-only test (no engine) for close/dismiss/reopen**

Append inside the same `describe`:

```ts
  it('closes to a launcher, remembers dismissal, reopens from hero and launcher', async () => {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${SITE_PORT}`, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('region', {name: 'Try conciv live'})
    await expect.poll(() => panel.isVisible(), {timeout: 15_000}).toBe(true)
    await page.getByRole('button', {name: 'Close the live demo panel'}).click()
    await expect.poll(() => panel.isVisible()).toBe(false)
    const launcher = page.getByRole('button', {name: 'Open the live demo panel'})
    await expect.poll(() => launcher.isVisible()).toBe(true)
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect.poll(() => launcher.isVisible(), {timeout: 15_000}).toBe(true)
    expect(await panel.isVisible()).toBe(false)
    expect(page.url()).not.toContain('try=1')
    await page.getByRole('button', {name: /try it live/i}).click()
    await expect.poll(() => panel.isVisible()).toBe(true)
    await page.getByRole('button', {name: 'Close the live demo panel'}).click()
    await launcher.click()
    await expect.poll(() => panel.isVisible()).toBe(true)
    await page.close()
  }, 60_000)
```

- [ ] **Step 3: Rebuild what the IT consumes, then run**

```bash
pnpm turbo run build --filter=@conciv/embed --filter=@conciv/site
pnpm --filter @conciv/site test
```

Expected: all site tests PASS (this exercises the full pair → seed → open-panel handoff against a real engine). If the widget boots closed (textbox never appears without a click), debug the seed: check the engine's navigation state and the exact `NavigationStateSchema` payload — do NOT paper over by clicking the FAB in the test.

- [ ] **Step 4: Commit**

```bash
git add apps/site/test/live-connect.it.test.ts
git commit -m "test(site): widget-first connect e2e — auto-open, seeded open panel, dismissal" -- apps/site/test/live-connect.it.test.ts
```

---

### Task 7: Gates + polish pass

- [ ] **Step 1: Full gates from root**

```bash
pnpm typecheck && pnpm build && pnpm test
pnpm exec fallow audit --changed-since main --format json
```

Expected: green; fix anything fallow flags as INTRODUCED (dead exports from the deleted `connect-live.tsx` consumers are the likely candidates — `connectLoop`/`watchHealth`/`healthy` variants left unused in `lib/connect-live.ts` must be deleted, verified with `pnpm exec fallow dead-code --trace`). Rerun suspect suites with `turbo run test --force` if a cached green looks stale.

- [ ] **Step 2: Polish pass** — load `impeccable:polish` and review the panel/launcher/handoff in a real browser (`pnpm --filter @conciv/site dev` or the wrangler preview): entry/exit timing, stagger, blur handoff, reduced-motion, small viewport (bottom-sheet behavior), dark/light. Fix what it finds; keep the motion table values from the spec as the source of truth.

- [ ] **Step 3: Changeset check** — this touches only `apps/site` (private, unpublished): no changeset needed. Verify `apps/site/package.json` has `"private": true`; if the existing `.changeset/live-widget-connect.md` in this worktree already covers site changes, leave it as is.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A apps/site
git commit -m "polish(site): widget-first connect motion + cleanup" -- apps/site
```
