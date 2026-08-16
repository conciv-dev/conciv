import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createSignal, For} from 'solid-js'
import {ChatPane} from '../src/pane/chat-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const COMPACT_PATH = ['sessions', 'compact']
const NARROW_PX = 160
const WIDE_PX = 460

const core = {base: ''}
const active: {pane: PaneMount | null} = {pane: null}
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'composer-overflow', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(() => {
  active.pane?.dispose()
  active.pane = null
})

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grabButton = () => page.getByRole('button', {name: 'Select an element from the page'})
const newSessionButton = () => page.getByRole('button', {name: 'Start a new session'})
const compactButton = () => page.getByRole('button', {name: 'Compress the conversation'})
const trigger = () => page.getByRole('button', {name: 'More composer actions'})
const newSessionItem = () => page.getByRole('menuitem', {name: 'Start a new session'})
const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})

async function mountComposer(width?: number): Promise<PaneMount> {
  const sessionId = await createSession(coreRpc(core.base))
  const [requests, setRequests] = createSignal<string[]>([])
  const mount = mountPane(
    {
      base: core.base,
      sessionId,
      width,
      onNewSession: () => setRequests((current) => [...current, 'a new session']),
    },
    () => (
      <>
        <ul>
          <For each={requests()}>{(request) => <li>{`the pane requested ${request}`}</li>}</For>
        </ul>
        <ChatPane sessionId={sessionId} />
      </>
    ),
  )
  active.pane = mount
  await expect.element(input()).toBeVisible()
  return mount
}

test('a wide composer keeps every built-in action inline and shows no overflow trigger', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(grabButton()).toBeVisible()
  await expect.element(newSessionButton()).toBeVisible()
  await expect.element(compactButton()).toBeVisible()
  await expect.element(trigger()).not.toBeInTheDocument()
})

test('a narrow composer keeps grab pinned and runs the collapsed new-session action from the menu', async () => {
  const mount = await mountComposer()

  mount.setWidth(NARROW_PX)

  await expect.element(newSessionButton()).not.toBeInTheDocument()
  await expect.element(grabButton()).toBeVisible()
  await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')

  await userEvent.click(trigger())
  await userEvent.click(newSessionItem())

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(newSessionItem()).not.toBeInTheDocument()
})

test('a session that is already compacting cannot be compacted again from the overflow menu', async () => {
  const gate = await faults.install({kind: 'gate', path: COMPACT_PATH})
  const mount = await mountComposer(WIDE_PX)

  await userEvent.click(compactButton())
  await coreControl.awaitFaultPending(gate, 1)
  await expect.element(compactButton()).toBeDisabled()

  mount.setWidth(NARROW_PX)

  await expect.element(compactButton()).not.toBeInTheDocument()
  await userEvent.click(trigger())
  await expect.element(compactItem()).toHaveAttribute('aria-disabled', 'true')

  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(compactItem()).not.toBeInTheDocument()
  expect(await coreControl.faultPending(gate)).toBe(1)
})

test('widening the composer closes the overflow menu and returns the caret to the input', async () => {
  const mount = await mountComposer(NARROW_PX)

  await userEvent.click(trigger())
  await expect.element(compactItem()).toBeVisible()

  mount.setWidth(WIDE_PX)

  await expect.element(compactButton()).toBeVisible()
  await expect.element(compactItem()).not.toBeInTheDocument()
  await expect.element(trigger()).not.toBeInTheDocument()
  await expect.element(input()).toHaveFocus()
})
