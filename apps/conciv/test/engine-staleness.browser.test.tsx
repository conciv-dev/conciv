import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {EngineStaleNotice} from '../src/shell/engine-notice.js'
import {installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

function mountNotice(config: Parameters<typeof installFakeCore>[0] = {}): {refetch: () => Promise<void>} {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})], ...config})
  const mounted = mountPane(() => <EngineStaleNotice />)
  return {refetch: mounted.refetch}
}

test('an engine running outdated code says so, and says it is the server code that moved', async () => {
  mountNotice({engineStale: true})

  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('server code on disk is newer than the running engine')
  await expect.element(page.getByRole('alert')).toHaveTextContent('Restart the dev server')
})

test('an engine that matches the code on disk raises nothing at all', async () => {
  mountNotice({engineStale: false})

  await core?.idle()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('the outdated-engine notice stands until it is dismissed by hand', async () => {
  mountNotice({engineStale: true})
  await expect.element(page.getByRole('alert')).toBeVisible()

  await page.getByRole('button', {name: 'Dismiss'}).click()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('restarting the engine takes the notice down without anyone dismissing it', async () => {
  const mounted = mountNotice({engineStale: true})
  await expect.element(page.getByRole('alert')).toBeVisible()

  core?.setEngine({stale: false, fingerprint: 'stamp-restarted'})
  await mounted.refetch()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('a dismissed notice stays down while the engine is stale in the very same way', async () => {
  const mounted = mountNotice({engineStale: true})
  await page.getByRole('button', {name: 'Dismiss'}).click()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

  await mounted.refetch()
  await core?.idle()

  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('a further rebuild speaks up again even after the earlier notice was dismissed', async () => {
  const mounted = mountNotice({engineStale: true})
  await page.getByRole('button', {name: 'Dismiss'}).click()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

  core?.setEngine({stale: true, fingerprint: 'stamp-rebuilt-again'})
  await mounted.refetch()

  await expect.element(page.getByRole('alert')).toBeVisible()
})
