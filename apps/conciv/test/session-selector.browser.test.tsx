import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {RpcClient} from '@conciv/contract'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {SessionSelector} from '../src/composer/session-selector.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, sendTurn} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const EXTERNAL_ID = HarnessSessionId.parse('external-mid-run')

const core = {base: ''}
const mounted: {pane: PaneMount | null} = {pane: null}

beforeAll(async () => {
  const booted = await coreControl.bootCore({
    id: 'session-selector',
    resume: true,
    allowedOrigins: [window.location.origin],
    history: [{id: EXTERNAL_ID, derivedTitle: 'a session mid-run', updatedAt: Date.now(), messageCount: 3}],
  })
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(async () => {
  mounted.pane?.dispose()
  mounted.pane = null
  await coreControl.releaseTurn()
})

async function adoptExternalSession(rpc: RpcClient): Promise<string> {
  const listed = await rpc.sessions.list()
  const external = listed.find((meta) => meta.native?.nativeId === EXTERNAL_ID)
  if (!external?.native) throw new Error('the harness history fixture never reached the session list')
  const {sessionId} = await rpc.sessions.open(external.native)
  return sessionId
}

async function mountSelector(): Promise<void> {
  const rpc = coreRpc(core.base)
  const activeId = (await rpc.sessions.create()).sessionId
  await rpc.sessions.rename({sessionId: activeId, title: 'the active session'})
  const externalId = await adoptExternalSession(rpc)
  await coreControl.holdTurn()
  await sendTurn(core.base, externalId, 'keep this session busy')
  mounted.pane = mountPane({base: core.base, sessionId: activeId}, () => (
    <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
  ))
}

const LONG_TITLE = 'Previous conversation: User: test fill in the form and accept the terms'

const RAIL_MENU = 'p-2 flex flex-col gap-1 w-72'

async function mountRailSelector(): Promise<void> {
  const rpc = coreRpc(core.base)
  const activeId = (await rpc.sessions.create()).sessionId
  await rpc.sessions.rename({sessionId: activeId, title: LONG_TITLE})
  mounted.pane = mountPane({base: core.base, sessionId: activeId}, () => (
    <div class={RAIL_MENU}>
      <SessionSelector variant="bar" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
    </div>
  ))
}

test('the rail selector reveals a session title too long for the popover', async () => {
  await mountRailSelector()
  const trigger = page.getByRole('button', {name: `Session: ${LONG_TITLE}`})
  await expect.element(trigger).toBeVisible()

  await trigger.hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
})

test('a session with a live core run carries the running dot, an idle one does not', async () => {
  await mountSelector()

  await page.getByRole('button', {name: 'Session: the active session'}).click()

  await expect.element(page.getByRole('option', {name: /a session mid-run.*running/})).toBeVisible()
  await expect.element(page.getByRole('option', {name: /^the active session(?!.*running)/})).toBeVisible()
})

test('the selector keeps freshness, message count and origin in the row description', async () => {
  await mountSelector()

  await page.getByRole('button', {name: 'Session: the active session'}).click()

  await expect
    .element(page.getByRole('option', {name: /a session mid-run.*3 messages.*started externally/}))
    .toBeVisible()
})
