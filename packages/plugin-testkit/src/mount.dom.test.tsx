import {describe, expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import {mount} from '@conciv/plugin-testkit/browser'

describe('mounting a plugin by its package name', () => {
  test('a window plugin named in mount shows its part in the app', async () => {
    await mount({plugins: [['@conciv/plugin-try-it', {token: '5f1d3c2a-7b8e-4c9d-a0b1-2c3d4e5f6a7b'}]]})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
  })

  test('a plugin with an engine part is refused, and the error says where it goes', async () => {
    await expect(mount({plugins: ['@conciv/plugin-ios']})).rejects.toThrow(
      'the plugin @conciv/plugin-ios runs in the engine: give it to createEngine({plugins})',
    )
  })
})
