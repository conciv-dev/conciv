import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {SessionSelector} from '../src/composer/session-selector.js'
import {installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'
import {mountPane} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

function mountSelector(): void {
  core = installFakeCore({
    sessions: [
      sessionRow({id: 'conciv_1', title: 'the active session'}),
      sessionRow({id: 'conciv_2', title: 'a session mid-run', running: true, origin: 'external'}),
    ],
  })
  mountPane(() => (
    <SessionSelector variant="pill" activeId={() => 'conciv_1'} onActivate={() => {}} onNewSession={() => {}} />
  ))
}

test('a session with a live core run carries the running dot, an idle one does not', async () => {
  mountSelector()

  await page.getByRole('button', {name: 'Session: the active session'}).click()

  await expect.element(page.getByRole('option', {name: /a session mid-run.*running/})).toBeVisible()
  await expect.element(page.getByRole('option', {name: /^the active session(?!.*running)/})).toBeVisible()
})

test('the selector keeps freshness, message count and origin in the row description', async () => {
  mountSelector()

  await page.getByRole('button', {name: 'Session: the active session'}).click()

  await expect
    .element(page.getByRole('option', {name: /a session mid-run.*3 messages.*started externally/}))
    .toBeVisible()
})
