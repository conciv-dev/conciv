import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, type Setter} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {ConnectDialog} from '../src/composer/connect/connect-dialog.js'
import {COPY_LABEL, KEEP_WAITING_LABEL, OPEN_NEW_LABEL, RETRY_LABEL} from '../src/composer/connect/connect-copy.js'
import type {ConnectStep} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const ADOPTED = {
  concivSessionId: 'conciv_9',
  harnessSessionId: 'sess-1',
  title: 'the older one',
  reloadCommand: '/reload-plugins --force',
}

const OPEN_TRIGGER = 'Open the picker with the mouse'

function ringOf(element: Element): string {
  const style = getComputedStyle(element)
  if (style.outlineStyle === 'none') return 'none'
  return `${style.outlineStyle} ${style.outlineWidth}`
}

function focusRing(): string {
  const active = document.activeElement
  return active === null ? 'nothing focused' : ringOf(active)
}

type Mounted = {step: Setter<ConnectStep>; picked: string[]}

function mount(opened: ConnectStep, candidates: LiveSession[] | undefined, failure: string | null = null): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [step, setStep] = createSignal<ConnectStep>({kind: 'closed'})
  const [current, setCurrent] = createSignal<ConnectStep>(opened)
  const mounted: Mounted = {step: setCurrent, picked: []}
  const dispose = render(
    () => (
      <>
        <button type="button" onClick={() => setStep(current())}>
          {OPEN_TRIGGER}
        </button>
        <ConnectDialog
          step={step()}
          harnessName="Claude"
          candidates={candidates}
          arrived={0}
          loading={false}
          refreshing={false}
          failure={failure}
          stale={false}
          checkedAt={Date.now() - 4_000}
          connectingId={null}
          dialledIn={false}
          contactLost={false}
          unreachable={false}
          onPick={(session) => {
            mounted.picked.push(session.sessionId)
            setCurrent({kind: 'reload', adopted: ADOPTED})
            setStep({kind: 'reload', adopted: ADOPTED})
          }}
          onClose={() => setStep({kind: 'closed'})}
          onRetry={() => {}}
          onRefresh={() => {}}
          onLaunch={() => {}}
          onBack={() => {}}
          onDone={() => {}}
          onKeepWaiting={() => {}}
          onHandBack={() => {}}
        />
      </>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return mounted
}

async function openWithTheMouse(): Promise<void> {
  await page.getByRole('button', {name: OPEN_TRIGGER}).click()
}

test('a picker opened with the mouse still shows the reader where the keyboard landed', async () => {
  mount({kind: 'picking', error: null, retryId: null}, [liveSession()])

  await openWithTheMouse()

  const row = page.getByRole('button', {name: /rename the widget package/})
  await expect.element(row).toBeVisible()
  await expect.poll(() => document.activeElement).toBe(row.element())
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('the step the flow moves to after a mouse click shows its focus too', async () => {
  mount({kind: 'picking', error: null, retryId: null}, [liveSession()])
  await openWithTheMouse()

  await page.getByRole('button', {name: /rename the widget package/}).click()

  const copy = page.getByRole('button', {name: COPY_LABEL})
  await expect.element(copy).toBeVisible()
  await expect.poll(() => document.activeElement).toBe(copy.element())
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('the reload step shows its focus when the mouse opened it', async () => {
  mount({kind: 'reload', adopted: ADOPTED}, [liveSession({ready: false})])
  await openWithTheMouse()

  await expect.element(page.getByRole('button', {name: COPY_LABEL})).toBeVisible()
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('the leave confirmation shows its focus when the mouse opened it', async () => {
  mount({kind: 'leaveConfirm', adopted: ADOPTED}, [liveSession({ready: false})])
  await openWithTheMouse()

  await expect.element(page.getByRole('button', {name: KEEP_WAITING_LABEL})).toBeVisible()
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('the restart snippet shows its focus when the mouse opened it', async () => {
  mount({kind: 'snippet', command: 'claude --resume tok-1', detail: 'the cli is too old'}, [])
  await openWithTheMouse()

  await expect.element(page.getByRole('button', {name: COPY_LABEL})).toBeVisible()
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('an empty picker opened with the mouse shows its focus on the way forward', async () => {
  mount({kind: 'picking', error: null, retryId: null}, [])
  await openWithTheMouse()

  await expect.element(page.getByRole('button', {name: OPEN_NEW_LABEL})).toBeVisible()
  await expect.poll(() => focusRing()).toBe('solid 2px')
})

test('a picker that could not check shows its focus on the retry the mouse opened it onto', async () => {
  mount({kind: 'picking', error: null, retryId: null}, undefined, 'the server hung up')
  await openWithTheMouse()

  await expect.element(page.getByRole('button', {name: RETRY_LABEL})).toBeVisible()
  await expect.poll(() => focusRing()).toBe('solid 2px')
})
