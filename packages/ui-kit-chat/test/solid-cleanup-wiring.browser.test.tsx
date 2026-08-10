import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountView} from './mount-view.js'

it('mounts a marker button for the next test to check against', async () => {
  mountView(() => <button type="button">cleanup marker</button>)
  await expect.element(page.getByRole('button', {name: 'cleanup marker'})).toBeVisible()
})

it('sees only its own mount, proving the shared afterEach(cleanup) ran between tests', async () => {
  mountView(() => <button type="button">cleanup marker</button>)
  await expect.element(page.getByRole('button', {name: 'cleanup marker'})).toBeVisible()
})
