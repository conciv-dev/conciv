import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {EngineStaleness} from '@conciv/contract'
import {EngineStaleNotice} from '../src/shell/engine-notice.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const core = {base: ''}
const mounted: {pane: PaneMount | null} = {pane: null}

const TRACKED = ['@conciv/core', '@conciv/tools']

function staleness(stale: boolean, fingerprint: string): EngineStaleness {
  return {
    stale,
    changed: stale ? ['@conciv/tools'] : [],
    tracked: TRACKED,
    bootedAt: 0,
    fingerprint,
  }
}

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'engine-staleness', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(() => {
  mounted.pane?.dispose()
  mounted.pane = null
})

async function mountNotice(engine: EngineStaleness): Promise<PaneMount> {
  await coreControl.setStaleness(engine)
  const sessionId = await createSession(coreRpc(core.base))
  const pane = mountPane({base: core.base, sessionId}, () => <EngineStaleNotice />)
  mounted.pane = pane
  return pane
}

async function settleEngine(pane: PaneMount): Promise<void> {
  await pane.queryClient.ensureQueryData(pane.data.utils.meta.engine.queryOptions())
}

test('an engine running outdated code says so, and says it is the server code that moved', async () => {
  await mountNotice(staleness(true, 'stamp-boot'))

  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('server code on disk is newer than the running engine')
  await expect.element(page.getByRole('alert')).toHaveTextContent('Restart the dev server')
})

test('an engine that matches the code on disk raises nothing at all', async () => {
  const pane = await mountNotice(staleness(false, 'stamp-boot'))

  await settleEngine(pane)

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('the outdated-engine notice stands until it is dismissed by hand', async () => {
  await mountNotice(staleness(true, 'stamp-boot'))
  await expect.element(page.getByRole('alert')).toBeVisible()

  await page.getByRole('button', {name: 'Dismiss'}).click()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('restarting the engine takes the notice down without anyone dismissing it', async () => {
  const pane = await mountNotice(staleness(true, 'stamp-boot'))
  await expect.element(page.getByRole('alert')).toBeVisible()

  await coreControl.setStaleness(staleness(false, 'stamp-restarted'))
  await pane.refetch()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('a dismissed notice stays down while the engine is stale in the very same way', async () => {
  const pane = await mountNotice(staleness(true, 'stamp-boot'))
  await page.getByRole('button', {name: 'Dismiss'}).click()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

  await pane.refetch()
  await settleEngine(pane)

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('a further rebuild speaks up again even after the earlier notice was dismissed', async () => {
  const pane = await mountNotice(staleness(true, 'stamp-boot'))
  await page.getByRole('button', {name: 'Dismiss'}).click()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

  await coreControl.setStaleness(staleness(true, 'stamp-rebuilt-again'))
  await pane.refetch()

  await expect.element(page.getByRole('alert')).toBeVisible()
})
