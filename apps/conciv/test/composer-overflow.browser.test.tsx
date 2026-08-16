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
const attachButton = () => page.getByRole('button', {name: 'Add an attachment'})
const sendButton = () => page.getByRole('button', {name: 'Send message'})
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

test('a wide composer keeps only the pinned grab action inline and runs the rest from the overflow menu', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(grabButton()).toBeVisible()
  await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(newSessionButton()).not.toBeInTheDocument()
  await expect.element(compactButton()).not.toBeInTheDocument()

  await userEvent.click(trigger())
  await expect.element(compactItem()).toBeVisible()
  await userEvent.click(newSessionItem())

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(newSessionItem()).not.toBeInTheDocument()
})

test('the attachment button carries the same tooltip-backed name as the rest of the row', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(attachButton()).toBeVisible()

  await userEvent.hover(attachButton())

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Add an attachment')
})

test('the send button carries the same tooltip-backed name as the rest of the row', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(sendButton()).toBeVisible()

  await userEvent.hover(sendButton())

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Send message')
})

test('a narrow composer still keeps the pinned grab action inline beside the overflow trigger', async () => {
  const mount = await mountComposer()

  mount.setWidth(NARROW_PX)

  await expect.element(grabButton()).toBeVisible()
  await expect.element(trigger()).toBeVisible()
  await expect.element(newSessionButton()).not.toBeInTheDocument()
})

test('a session that is already compacting cannot be compacted again from the overflow menu', async () => {
  const gate = await faults.install({kind: 'gate', path: COMPACT_PATH})
  await mountComposer(WIDE_PX)

  await userEvent.click(trigger())
  await userEvent.click(compactItem())
  await coreControl.awaitFaultPending(gate, 1)

  await userEvent.click(trigger())
  await expect.element(compactItem()).toHaveAttribute('aria-disabled', 'true')

  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(compactItem()).not.toBeInTheDocument()
  expect(await coreControl.faultPending(gate)).toBe(1)
})
