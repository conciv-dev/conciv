import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, type Setter} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {ConnectDialog} from '../src/composer/connect/connect-dialog.js'
import {
  CHECK_AGAIN_LABEL,
  CONNECTING_LABEL,
  CONTACT_LOST,
  DIALOG_TITLE,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  ONE_TIME_SETUP,
  PREVIEW_EMPTY,
  PREVIEW_UNAVAILABLE,
  RETRY_LABEL,
  STALE_NOTICE,
  TRANSCRIPT_UNAVAILABLE,
  UNTITLED_SESSION,
} from '../src/composer/connect/connect-copy.js'
import type {ConnectStep} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

type View = {
  step: Setter<ConnectStep>
  candidates: Setter<LiveSession[] | undefined>
  loading: Setter<boolean>
  refreshing: Setter<boolean>
  failure: Setter<string | null>
  stale: Setter<boolean>
  connectingId: Setter<string | null>
  dialledIn: Setter<boolean>
  contactLost: Setter<boolean>
  picked: string[]
  copied: string[]
  closed: number[]
  retried: number[]
  refreshed: number[]
  launched: number[]
  backed: number[]
  done: number[]
}

const PICKING: ConnectStep = {kind: 'picking', error: null, retryId: null}

function mount(initial: LiveSession[] | undefined = undefined): View {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [step, setStep] = createSignal<ConnectStep>({kind: 'closed'})
  const [candidates, setCandidates] = createSignal<LiveSession[] | undefined>(initial)
  const [loading, setLoading] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(false)
  const [failure, setFailure] = createSignal<string | null>(null)
  const [stale, setStale] = createSignal(false)
  const [connectingId, setConnectingId] = createSignal<string | null>(null)
  const [dialledIn, setDialledIn] = createSignal(false)
  const [contactLost, setContactLost] = createSignal(false)
  const view: View = {
    step: setStep,
    candidates: setCandidates,
    loading: setLoading,
    refreshing: setRefreshing,
    failure: setFailure,
    stale: setStale,
    connectingId: setConnectingId,
    dialledIn: setDialledIn,
    contactLost: setContactLost,
    picked: [],
    copied: [],
    closed: [],
    retried: [],
    refreshed: [],
    launched: [],
    backed: [],
    done: [],
  }
  const dispose = render(
    () => (
      <ConnectDialog
        step={step()}
        harnessName="Claude"
        candidates={candidates()}
        loading={loading()}
        refreshing={refreshing()}
        failure={failure()}
        stale={stale()}
        checkedAt={Date.now() - 4_000}
        connectingId={connectingId()}
        dialledIn={dialledIn()}
        contactLost={contactLost()}
        onPick={(session) => view.picked.push(session.sessionId)}
        onCopy={(text) => view.copied.push(text)}
        onClose={() => view.closed.push(1)}
        onRetry={() => view.retried.push(1)}
        onRefresh={() => view.refreshed.push(1)}
        onLaunch={() => view.launched.push(1)}
        onBack={() => view.backed.push(1)}
        onDone={() => view.done.push(1)}
      />
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
  await expect.element(page.getByRole('button', {name: /fix the flaky test/})).toBeDisabled()
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

  await page.getByRole('button', {name: 'Copy command'}).click()
  expect(view.copied).toEqual(['/reload-plugins --force'])

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
  await page.getByRole('button', {name: 'Copy command'}).click()
  expect(view.copied).toEqual(["cd '/repo' && claude --resume tok-1"])

  await page.getByRole('button', {name: 'Close'}).click()
  expect(view.closed).toHaveLength(1)
})

test('takes its name from the one visible heading and leaves on escape', async () => {
  const view = mount([])

  const heading = page.getByRole('heading', {name: DIALOG_TITLE})
  await expect.element(heading).toBeVisible()
  expect(page.getByText(DIALOG_TITLE).elements()).toHaveLength(1)

  const modal = page.getByRole('dialog', {name: DIALOG_TITLE})
  await expect.element(modal).toHaveAttribute('aria-labelledby', heading.element().id)

  await userEvent.keyboard('{Escape}')
  await expect.poll(() => view.closed.length).toBe(1)
})

test('a very long title and terminal name still leave a locatable row', async () => {
  const long = 'r'.repeat(300)
  mount([liveSession({title: long, name: 'n'.repeat(60)})])

  await expect.element(page.getByRole('button', {name: new RegExp(long.slice(0, 40))})).toBeVisible()
})
