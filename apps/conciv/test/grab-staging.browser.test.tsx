import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import pageExtension from '@conciv/extension-page/client'
import {GRAB_FILE_NAME} from '@conciv/grab/grab-attachment'
import {ChatPane} from '../src/pane/chat-pane.js'
import {makePaneGrabApi} from '../src/extension/pane-grab.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {HERO_GRAB, HERO_LABEL} from './helpers/grab-fixtures.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const core = {base: ''}
const active: {pane: PaneMount | null} = {pane: null}

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'grab-staging', allowedOrigins: [window.location.origin]})
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
const snapshot = () => page.getByTitle('Grabbed element snapshot')
const removeGrab = () => page.getByRole('button', {name: `Remove ${GRAB_FILE_NAME}`})

test('the grab api an extension receives can stage, read and clear, as the terminal does', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  const mount = mountPane({base: core.base, sessionId, extensions: [pageExtension]}, () => (
    <ChatPane sessionId={sessionId} />
  ))
  active.pane = mount
  await expect.element(input()).toBeVisible()
  const api = makePaneGrabApi(mount.pane.grabStaging, mount.pane.grabProvider)

  api.stage(HERO_GRAB)

  await expect.element(snapshot()).toBeVisible()
  await expect.element(page.getByText(HERO_LABEL)).toBeVisible()
  expect(api.staged().map((grab) => grab.text)).toEqual([HERO_GRAB.text])

  api.clear()

  await expect.element(removeGrab()).not.toBeInTheDocument()
  expect(api.staged()).toHaveLength(0)
})
