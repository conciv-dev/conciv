import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {mount} from '@conciv/plugin-testkit/browser'

describe('mounting a plugin by its package name', () => {
  test('a window plugin named in mount shows its part, with the options given to it, and its store updates in place', async () => {
    const user = userEvent.setup()
    await mount('conciv-greeting', {options: {greeting: 'Hello from the greeting plugin'}})

    expect(await screen.findByRole('heading', {name: 'Hello from the greeting plugin'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Waved 0 times'}))
    expect(await screen.findByRole('button', {name: 'Waved 1 times'})).toBeVisible()
  })

  test('a plugin with an engine part is refused, and the error says where it goes', async () => {
    await expect(mount('conciv-engine-tool')).rejects.toThrow(
      'the plugin conciv-engine-tool runs in the engine: give it to pluginEngine({plugins}) and mount its plugin-experimental part',
    )
  })
})

describe('the viewport between tests', () => {
  test('a test that shrinks the viewport to phone width gets it', async () => {
    await page.viewport(375, 800)

    expect([window.innerWidth, window.innerHeight]).toEqual([375, 800])
  })

  test('the next test starts at the configured 1280x800 again, so a wide-page test never runs at phone width', () => {
    expect([window.innerWidth, window.innerHeight]).toEqual([1280, 800])
  })
})
