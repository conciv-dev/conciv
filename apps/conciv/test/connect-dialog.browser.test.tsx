import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, For, type Setter} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {ConnectDialog} from '../src/composer/connect/connect-dialog.js'
import {
  CANNOT_TELL,
  CHECK_AGAIN_LABEL,
  CLIPBOARD_BLOCKED,
  CONNECTING_LABEL,
  COPIED_LABEL,
  COPY_LABEL,
  CONTACT_LOST,
  DIALOG_TITLE,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  ONE_TIME_SETUP,
  PREVIEW_EMPTY,
  PREVIEW_UNAVAILABLE,
  REFRESH_LABEL,
  RETRY_LABEL,
  SELECT_COMMAND_LABEL,
  SHOW_NEW_LABEL,
  STALE_NOTICE,
  TRANSCRIPT_UNAVAILABLE,
  UNTITLED_SESSION,
} from '../src/composer/connect/connect-copy.js'
import type {ConnectStep} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const disposers: (() => void)[] = []
const realClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')

const clipboard = {writes: [] as string[], deny: false}

function stubClipboard(): void {
  clipboard.writes = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (clipboard.deny) return Promise.reject(new Error('denied'))
        clipboard.writes.push(text)
        return Promise.resolve()
      },
    },
  })
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  clipboard.deny = false
  delete (navigator as {clipboard?: unknown}).clipboard
  if (realClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', realClipboard)
})

type View = {
  step: Setter<ConnectStep>
  candidates: Setter<LiveSession[] | undefined>
  arrived: Setter<number>
  loading: Setter<boolean>
  refreshing: Setter<boolean>
  failure: Setter<string | null>
  stale: Setter<boolean>
  connectingId: Setter<string | null>
  dialledIn: Setter<boolean>
  contactLost: Setter<boolean>
  unreachable: Setter<boolean>
  picked: string[]
  retried: number[]
  refreshed: number[]
  launched: number[]
  backed: number[]
  done: number[]
  keptWaiting: number[]
  handedBack: number[]
}

const PICKING: ConnectStep = {kind: 'picking', error: null, retryId: null}

function mount(initial: LiveSession[] | undefined = undefined, harnessName = 'Claude'): View {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [step, setStep] = createSignal<ConnectStep>({kind: 'closed'})
  const [candidates, setCandidates] = createSignal<LiveSession[] | undefined>(initial)
  const [arrived, setArrived] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(false)
  const [failure, setFailure] = createSignal<string | null>(null)
  const [stale, setStale] = createSignal(false)
  const [connectingId, setConnectingId] = createSignal<string | null>(null)
  const [dialledIn, setDialledIn] = createSignal(false)
  const [contactLost, setContactLost] = createSignal(false)
  const [unreachable, setUnreachable] = createSignal(false)
  const [answers, setAnswers] = createSignal<string[]>([])
  const record = (answer: string) => setAnswers((seen) => [...seen, answer])
  const view: View = {
    step: setStep,
    candidates: setCandidates,
    arrived: setArrived,
    loading: setLoading,
    refreshing: setRefreshing,
    failure: setFailure,
    stale: setStale,
    connectingId: setConnectingId,
    dialledIn: setDialledIn,
    contactLost: setContactLost,
    unreachable: setUnreachable,
    picked: [],
    retried: [],
    refreshed: [],
    launched: [],
    backed: [],
    done: [],
    keptWaiting: [],
    handedBack: [],
  }
  const dispose = render(
    () => (
      <>
        <ul>
          <For each={answers()}>{(answer) => <li>saw {answer}</li>}</For>
        </ul>
        <ConnectDialog
          step={step()}
          harnessName={harnessName}
          candidates={candidates()}
          arrived={arrived()}
          loading={loading()}
          refreshing={refreshing()}
          failure={failure()}
          stale={stale()}
          checkedAt={Date.now() - 4_000}
          connectingId={connectingId()}
          dialledIn={dialledIn()}
          contactLost={contactLost()}
          unreachable={unreachable()}
          onKeepWaiting={() => view.keptWaiting.push(1)}
          onHandBack={() => view.handedBack.push(1)}
          onPick={(session) => view.picked.push(session.sessionId)}
          onClose={() => record('close')}
          onRetry={() => view.retried.push(1)}
          onRefresh={() => view.refreshed.push(1)}
          onLaunch={() => view.launched.push(1)}
          onBack={() => view.backed.push(1)}
          onDone={() => view.done.push(1)}
        />
      </>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  setStep(PICKING)
  return view
}

test('skeletons only while the very first check is running, never over data it already has', async () => {
  const view = mount()
  view.loading(true)

  await expect.element(page.getByText(LOOKING_LABEL)).toBeVisible()

  view.loading(false)
  view.candidates([liveSession()])
  view.refreshing(true)

  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()
  expect(page.getByText(LOOKING_LABEL).elements()).toHaveLength(0)
})

test('a row is one card: the transcript preview lives inside the button you click', async () => {
  mount([liveSession()])
  const row = page.getByRole('button', {name: /rename the widget package/})
  await expect.element(row).toBeVisible()

  const preview = page.getByText('Looking at the manifests now.').element()
  expect(row.element().contains(preview)).toBe(true)
})

test('never calls a session with nothing said in it active', async () => {
  mount([liveSession({messageCount: 0, title: '', tail: []})])

  await expect.element(page.getByRole('button', {name: new RegExp(UNTITLED_SESSION)})).toBeVisible()
  await expect.element(page.getByText(/terminal-1 · idle · 0 messages · started/)).toBeVisible()
  expect(page.getByText(/· active/).elements()).toHaveLength(0)
  await expect.element(page.getByText(PREVIEW_EMPTY)).toBeVisible()
})

test('a session whose transcript cannot be read never passes for a brand new one', async () => {
  mount([liveSession({messageCount: 0, title: '', tail: [], historyStatus: 'unavailable'})])

  await expect.element(page.getByRole('button', {name: /terminal-1/})).toBeVisible()
  expect(page.getByText(UNTITLED_SESSION).elements()).toHaveLength(0)
  await expect.element(page.getByText(new RegExp(TRANSCRIPT_UNAVAILABLE))).toBeVisible()
  await expect.element(page.getByText(PREVIEW_UNAVAILABLE)).toBeVisible()
  await expect.element(page.getByRole('button', {name: /terminal-1/})).toBeEnabled()
})

test('an empty list says so without a subtitle counting to zero', async () => {
  const view = mount([])

  await expect.element(page.getByText('No Claude session is running here.')).toBeVisible()
  expect(page.getByText(/running in this project/).elements()).toHaveLength(0)

  await page.getByRole('button', {name: 'Open a new session'}).click()
  expect(view.launched).toHaveLength(1)
  await page.getByRole('button', {name: CHECK_AGAIN_LABEL}).click()
  expect(view.refreshed).toHaveLength(1)
})

test('a failed check is its own cell, never the empty one', async () => {
  const view = mount(undefined)
  view.failure('the server hung up')

  const alert = page.getByText(LOOKUP_FAILED)
  await expect.element(alert).toBeVisible()
  await expect.element(page.getByText('the server hung up')).toBeVisible()
  expect(page.getByText('No Claude session is running here.').elements()).toHaveLength(0)

  await page.getByRole('button', {name: RETRY_LABEL}).click()
  expect(view.refreshed).toHaveLength(1)
})

test('an empty answer after a failed check reads as the failure, not as nothing running', async () => {
  const view = mount([])
  await expect.element(page.getByText('No Claude session is running here.')).toBeVisible()

  view.candidates(undefined)
  view.failure('the server hung up')

  await expect.element(page.getByText(LOOKUP_FAILED)).toBeVisible()
  expect(page.getByText('No Claude session is running here.').elements()).toHaveLength(0)
})

test('a refetch that failed over good rows keeps the rows and admits it stopped refreshing', async () => {
  const view = mount([liveSession({working: true})])
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()

  view.failure('the server hung up')
  view.stale(true)

  await expect.element(page.getByText(new RegExp(STALE_NOTICE))).toBeVisible()
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()
  expect(page.getByText(LOOKUP_FAILED).elements()).toHaveLength(0)
})

test('only the picked row goes busy; the others stay clickable', async () => {
  const view = mount([liveSession(), liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})])

  await page.getByRole('button', {name: /fix the flaky test/}).click()
  expect(view.picked).toEqual(['sess-2'])

  view.connectingId('sess-2')

  await expect.element(page.getByText(CONNECTING_LABEL)).toBeVisible()
  const busy = page.getByRole('button', {name: /fix the flaky test/})
  await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
  expect(busy.element().hasAttribute('disabled')).toBe(false)
  expect(busy.element().tabIndex).toBe(0)
  busy.element().dispatchEvent(new MouseEvent('click', {bubbles: true}))
  expect(view.picked).toEqual(['sess-2'])
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeEnabled()
  expect(page.getByText(CONNECTING_LABEL).elements()).toHaveLength(1)
})

test('a failed connect shows the reason above a list that is still alive', async () => {
  const view = mount([liveSession(), liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})])
  view.step({kind: 'picking', error: 'that session runs in a subdirectory', retryId: 'sess-2'})

  await expect.element(page.getByText('that session runs in a subdirectory')).toBeVisible()
  await page.getByRole('button', {name: /rename the widget package/}).click()
  expect(view.picked).toEqual(['sess-1'])

  await page.getByRole('button', {name: RETRY_LABEL}).click()
  expect(view.retried).toHaveLength(1)
})

test('badges only the session that started before conciv was installed', async () => {
  mount([liveSession(), liveSession({sessionId: 'sess-2', title: 'the older one', ready: false})])

  await expect.element(page.getByRole('button', {name: new RegExp(ONE_TIME_SETUP)})).toBeVisible()
  expect(page.getByText(ONE_TIME_SETUP).elements()).toHaveLength(1)
})

test('the reload card is built from the adopt result and stops spinning when contact is lost', async () => {
  const view = mount([liveSession({ready: false})])
  view.step({
    kind: 'reload',
    adopted: {
      concivSessionId: 'conciv_9',
      harnessSessionId: 'sess-1',
      title: 'the older one',
      reloadCommand: '/reload-plugins --force',
    },
  })

  await expect.element(page.getByText('the older one')).toBeVisible()
  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
  await expect.element(page.getByText(/Waiting for this session to dial in/)).toBeVisible()

  stubClipboard()
  await page.getByRole('button', {name: COPY_LABEL}).click()
  await expect.element(page.getByText(COPIED_LABEL)).toBeVisible()
  expect(clipboard.writes).toEqual(['/reload-plugins --force'])

  view.contactLost(true)
  await expect.element(page.getByText(CONTACT_LOST)).toBeVisible()
  expect(page.getByText(/Waiting for this session to dial in/).elements()).toHaveLength(0)

  view.contactLost(false)
  view.dialledIn(true)
  await page.getByRole('button', {name: 'Done'}).click()
  expect(view.done).toHaveLength(1)
})

test('falls back to a restart snippet when the cli is too old', async () => {
  const view = mount([])
  view.step({
    kind: 'snippet',
    command: "cd '/repo' && claude --resume tok-1",
    detail: 'claude 2.1.100 lacks /reload-plugins --force',
  })

  await expect.element(page.getByText(/lacks \/reload-plugins --force/)).toBeVisible()
  stubClipboard()
  await page.getByRole('button', {name: COPY_LABEL}).click()
  expect(clipboard.writes).toEqual(["cd '/repo' && claude --resume tok-1"])

  await page.getByRole('button', {name: 'Close'}).click()
  await expect.element(page.getByText('saw close')).toBeVisible()
})

test('takes its name from the one visible heading and leaves on escape', async () => {
  mount([])

  const heading = page.getByRole('heading', {name: DIALOG_TITLE})
  await expect.element(heading).toBeVisible()
  expect(page.getByText(DIALOG_TITLE).elements()).toHaveLength(1)

  const modal = page.getByRole('dialog', {name: DIALOG_TITLE})
  await expect.element(modal).toHaveAttribute('aria-labelledby', heading.element().id)

  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByText('saw close')).toBeVisible()
})

test('a very long title and terminal name still leave a locatable row', async () => {
  const long = 'r'.repeat(300)
  mount([liveSession({title: long, name: 'n'.repeat(60)})])

  await expect.element(page.getByRole('button', {name: new RegExp(long.slice(0, 40))})).toBeVisible()
})

test('the copy confirmation lands inside the picker, where the reader is looking', async () => {
  const view = mount([])
  stubClipboard()
  view.step({kind: 'snippet', command: "cd '/repo' && claude --resume tok-1", detail: 'the cli is too old'})

  await page.getByRole('button', {name: COPY_LABEL}).click()

  const chip = page.getByText(COPIED_LABEL)
  await expect.element(chip).toBeVisible()
  expect(page.getByRole('dialog').element().contains(chip.element())).toBe(true)
})

test('a blocked clipboard says so and hands the command over to be selected', async () => {
  const view = mount([])
  stubClipboard()
  clipboard.deny = true
  view.step({kind: 'snippet', command: "cd '/repo' && claude --resume tok-1", detail: 'the cli is too old'})

  await page.getByRole('button', {name: COPY_LABEL}).click()

  await expect.element(page.getByText(CLIPBOARD_BLOCKED)).toBeVisible()
  const select = page.getByRole('button', {name: SELECT_COMMAND_LABEL})
  await expect.element(select).toBeVisible()
  expect(page.getByRole('dialog').element().contains(page.getByText(CLIPBOARD_BLOCKED).element())).toBe(true)
  expect(window.getSelection()?.toString()).toContain('claude --resume tok-1')
})

test('the terminal preview is described to a reader instead of being read out as the row name', async () => {
  mount([liveSession()])
  const found = page.getByRole('button', {name: /rename the widget package/})
  await expect.element(found).toBeVisible()
  const row = found.element()

  const named = (row.getAttribute('aria-labelledby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
  expect(named).toContain('rename the widget package')
  expect(named).toContain('terminal-1')
  expect(named).not.toContain('Looking at the manifests now.')

  const described = document.getElementById(row.getAttribute('aria-describedby') ?? '')
  expect(described?.textContent).toContain('Looking at the manifests now.')
})

test('a row whose transcript cannot be read is described by the sentence that admits it', async () => {
  mount([liveSession({historyStatus: 'unavailable'})])
  const found = page.getByRole('button', {name: /rename the widget package/})
  await expect.element(found).toBeVisible()
  const row = found.element()

  const described = document.getElementById(row.getAttribute('aria-describedby') ?? '')
  expect(described?.textContent).toBe(PREVIEW_UNAVAILABLE)
})

test('clicking the transcript preview picks the session it belongs to', async () => {
  const view = mount([liveSession()])

  await page.getByText('Looking at the manifests now.').click()

  expect(view.picked).toEqual(['sess-1'])
})

test('speaks the name of the harness in front of it and never a hardcoded one', async () => {
  mount([liveSession(), liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})], 'Codex')

  await expect.element(page.getByText(/2 Codex sessions are running in this project/)).toBeVisible()
  expect(page.getByRole('dialog').element().textContent).not.toContain('Claude')
})

test('shows the first eight sessions and keeps the rest one control away', async () => {
  const many = Array.from({length: 11}, (_, index) =>
    liveSession({
      sessionId: `sess-${index}`,
      title: `session number ${index}`,
      lastActivityAt: Date.now() - index * 1_000,
    }),
  )
  mount(many)

  await expect.element(page.getByRole('button', {name: /^session number 0/})).toBeVisible()
  expect(page.getByRole('button', {name: /^session number/}).elements()).toHaveLength(8)

  await page.getByRole('button', {name: 'Show all 11 sessions'}).click()

  expect(page.getByRole('button', {name: /^session number/}).elements()).toHaveLength(11)
})

test('every step hands the keyboard the control that step is about', async () => {
  const view = mount([liveSession()])
  const adopted = {
    concivSessionId: 'conciv_9',
    harnessSessionId: 'sess-1',
    title: 'the older one',
    reloadCommand: '/reload-plugins --force',
  }

  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toHaveFocus()

  view.step({kind: 'reload', adopted})
  await expect.element(page.getByRole('button', {name: COPY_LABEL})).toHaveFocus()

  view.step({kind: 'leaveConfirm', adopted})
  await expect.element(page.getByRole('button', {name: 'Keep waiting'})).toHaveFocus()

  view.step({kind: 'reload', adopted})
  await expect.element(page.getByRole('button', {name: COPY_LABEL})).toHaveFocus()

  view.step({kind: 'snippet', command: 'claude --resume tok-1', detail: 'the cli is too old'})
  await expect.element(page.getByRole('button', {name: COPY_LABEL})).toHaveFocus()
})

test('an empty picker puts the keyboard on the way forward', async () => {
  mount([])

  await expect.element(page.getByRole('button', {name: 'Open a new session'})).toHaveFocus()
})

test('a reload card that cannot reach the server stops promising and says so', async () => {
  const view = mount([liveSession({ready: false})])
  view.step({
    kind: 'reload',
    adopted: {
      concivSessionId: 'conciv_9',
      harnessSessionId: 'sess-1',
      title: 'the older one',
      reloadCommand: '/reload-plugins --force',
    },
  })
  view.unreachable(true)

  await expect.element(page.getByText(CANNOT_TELL)).toBeVisible()
  expect(page.getByText(/Waiting for this session to dial in/).elements()).toHaveLength(0)
  expect(page.getByText(CONTACT_LOST).elements()).toHaveLength(0)
})

function loopingAnimations(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')]
    .map((node) => node.getAttribute('class') ?? '')
    .filter((token) => /(^|\s)anim-(pulse|skel)(\s|$)/.test(token))
}

test('a list that stopped refreshing stops animating, so staleness reads at a glance', async () => {
  const view = mount([liveSession({working: true})])
  const row = page.getByRole('button', {name: /rename the widget package/})
  await expect.element(row).toBeVisible()
  expect(loopingAnimations(row.element())).not.toEqual([])

  view.stale(true)

  await expect.element(page.getByText(new RegExp(STALE_NOTICE))).toBeVisible()
  expect(loopingAnimations(page.getByRole('button', {name: /rename the widget package/}).element())).toEqual([])
})

const footerRefresh = () => page.getByRole('button', {name: REFRESH_LABEL})

test('a list with nothing wrong offers the one way to check again in the footer', async () => {
  mount([liveSession()])

  await expect.element(footerRefresh()).toBeVisible()
  expect(page.getByRole('button', {name: RETRY_LABEL}).elements()).toHaveLength(0)
  expect(page.getByRole('button', {name: CHECK_AGAIN_LABEL}).elements()).toHaveLength(0)
})

test('a list that stopped refreshing asks once, in the cell that explains why', async () => {
  const view = mount([liveSession()])
  view.stale(true)

  await expect.element(page.getByText(new RegExp(STALE_NOTICE))).toBeVisible()
  await expect.element(page.getByRole('button', {name: RETRY_LABEL})).toBeVisible()
  expect(footerRefresh().elements()).toHaveLength(0)
})

test('an empty picker asks once, next to the way forward', async () => {
  mount([])

  await expect.element(page.getByRole('button', {name: CHECK_AGAIN_LABEL})).toBeVisible()
  expect(footerRefresh().elements()).toHaveLength(0)
})

test('newly arrived sessions ask once, in the cell that announced them', async () => {
  const view = mount([liveSession()])
  view.arrived(2)

  await expect.element(page.getByRole('button', {name: SHOW_NEW_LABEL})).toBeVisible()
  expect(footerRefresh().elements()).toHaveLength(0)
})

test('a check that failed outright asks once, in the alert that reports it', async () => {
  const view = mount(undefined)
  view.failure('the server hung up')

  await expect.element(page.getByRole('button', {name: RETRY_LABEL})).toBeVisible()
  expect(footerRefresh().elements()).toHaveLength(0)
})

test('nothing the picker puts on screen blurs what is behind it', async () => {
  mount([liveSession()])
  await expect.element(page.getByRole('dialog')).toBeVisible()

  const blurring = [...document.querySelectorAll('*')].filter((node) => {
    const classes = node.getAttribute('class') ?? ''
    if (/(^|\s)backdrop-(blur|filter|saturate|brightness)/.test(classes)) return true
    return getComputedStyle(node).backdropFilter !== 'none'
  })

  expect(blurring.map((node) => node.getAttribute('class'))).toEqual([])
})
