import './helpers/utilities.css'
import {expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createSignal, For} from 'solid-js'
import {ChatPane} from '../src/pane/chat-pane.js'
import {bootedCore} from './helpers/booted-core.js'
import {keptPane} from './helpers/kept-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const menuitem = (name: string | RegExp) => page.getByRole('menuitem', {name})

const COMPACT_PATH = ['sessions', 'compact']
const NARROW_PX = 160
const WIDE_PX = 460

const PICKER_COMMANDS = [
  {name: '21st-ui-build', description: 'Build UI with the context of a component registry'},
  {name: 'show-context', description: 'Print the token budget'},
  {name: 'deploy', description: 'Ship the branch'},
  {name: 'context-summary', description: 'Summarize the conversation so far'},
  {name: 'context', description: 'Show what fills the window'},
]

const core = bootedCore('composer-overflow', {commands: PICKER_COMMANDS})
const keep = keptPane()
const faults = trackedFaults()

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grabButton = () => page.getByRole('button', {name: 'Select an element from the page'})
const newSessionButton = () => page.getByRole('button', {name: 'Start a new session'})
const compactButton = () => page.getByRole('button', {name: 'Compress the conversation'})
const trigger = () => page.getByRole('button', {name: 'More composer actions'})
const attachButton = () => page.getByRole('button', {name: 'Add an attachment'})
const sendButton = () => page.getByRole('button', {name: 'Send message'})
const newSessionItem = () => page.getByRole('menuitem', {name: 'Start a new session'})
const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})
const commandOption = (position: number) => page.getByRole('option').nth(position)

async function mountComposer(width?: number): Promise<PaneMount> {
  const sessionId = await createSession(coreRpc(core()))
  const [requests, setRequests] = createSignal<string[]>([])
  const mount = mountPane(
    {
      base: core(),
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
  keep(mount)
  await expect.element(input()).toBeVisible()
  return mount
}

test('a wide composer keeps no actions inline and runs everything from the overflow menu', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(grabButton()).not.toBeInTheDocument()
  await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(newSessionButton()).not.toBeInTheDocument()
  await expect.element(compactButton()).not.toBeInTheDocument()

  await userEvent.click(trigger())
  await expect.element(compactItem()).toBeVisible()
  await expect.element(menuitem('Select an element from the page')).toBeVisible()
  await userEvent.click(newSessionItem())

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(newSessionItem()).not.toBeInTheDocument()
})

test('the model pill is reachable from the overflow menu instead of sitting inline', async () => {
  const sessionId = await createSession(coreRpc(core()))
  const models = await coreRpc(core()).meta.models()
  const firstModel = models.models[0]
  const mount = mountPane({base: core(), sessionId, width: WIDE_PX}, () => <ChatPane sessionId={sessionId} />)
  keep(mount)
  await expect.element(input()).toBeVisible()

  await userEvent.click(trigger())
  if (firstModel) await expect.element(menuitem(new RegExp(`Model: ${firstModel.name}`))).toBeVisible()
})

test('the attachment button carries the same tooltip-backed name as the rest of the row', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(attachButton()).toBeVisible()

  await userEvent.hover(attachButton())

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Add an attachment')
})

test('the send button carries a discoverable name of its own, as a labeled control rather than a tooltip-only icon', async () => {
  await mountComposer(WIDE_PX)

  await expect.element(sendButton()).toBeVisible()
  await expect.element(sendButton()).toHaveTextContent('Send⏎')
})

test('a narrow composer keeps only the attach button and the overflow trigger inline', async () => {
  const mount = await mountComposer()

  mount.setWidth(NARROW_PX)

  await expect.element(attachButton()).toBeVisible()
  await expect.element(trigger()).toBeVisible()
  await expect.element(grabButton()).not.toBeInTheDocument()
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

  await userEvent.click(newSessionItem())

  await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
  await expect.element(compactItem()).not.toBeInTheDocument()
  expect(await coreControl.faultPending(gate)).toBe(1)
})

test('the slash picker ranks an exact name first, then a name prefix, a name match, and a description match', async () => {
  await mountComposer(WIDE_PX)

  await userEvent.click(input())
  await userEvent.keyboard('/context')

  await expect.element(commandOption(0)).toHaveTextContent('/contextShow what fills the window')
  await expect.element(commandOption(1)).toHaveTextContent('/context-summarySummarize the conversation so far')
  await expect.element(commandOption(2)).toHaveTextContent('/show-contextPrint the token budget')
  await expect
    .element(commandOption(3))
    .toHaveTextContent('/21st-ui-buildBuild UI with the context of a component registry')
  await expect.element(page.getByRole('option', {name: /deploy/})).not.toBeInTheDocument()

  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('option').first()).not.toBeInTheDocument()
  await expect.element(input().getByText('/context')).toBeVisible()
  await expect.element(input().getByText('21st-ui-build')).not.toBeInTheDocument()
})
