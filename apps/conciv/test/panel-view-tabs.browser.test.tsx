import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {JSX} from 'solid-js'
import {defineExtension} from '@conciv/extension'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, runTurn} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const SUBSCRIBE_PATH = ['chat', 'subscribe']
const NOTES_BODY = 'the notes view body'
const REPLY_TEXT = 'the transcript that outlives a tab switch'

function NotesView(): JSX.Element {
  return <p>{NOTES_BODY}</p>
}

const notesExtension = defineExtension({
  name: 'panel-view-survival',
  views: [{id: 'notes', label: 'Notes', Component: NotesView}],
})

const coreBase = bootedCore('panel-view-tabs')
const harness = createShellHarness(coreBase)
const faults = trackedFaults()

afterEach(harness.dispose)

const reply = () => page.getByText(REPLY_TEXT)
const notes = () => page.getByText(NOTES_BODY)
const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
const chatTab = () => page.getByRole('tab', {name: 'Chat'})
const notesTab = () => page.getByRole('tab', {name: 'Notes'})

test('the panel keeps its chat stream alive across a view tab round trip', async () => {
  const rpc = coreRpc(coreBase())
  const sessionId = await createSession(rpc)
  await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
  await runTurn(rpc, sessionId, 'seed the transcript')
  harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])

  await expect.element(reply(), {timeout: 8000}).toBeVisible()

  await notesTab().click()
  await expect.element(notes(), {timeout: 8000}).toBeVisible()

  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
  await chatTab().click()

  await expect.element(reply(), {timeout: 8000}).toBeVisible()
  await expect.element(skeleton()).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)
}, 30_000)
