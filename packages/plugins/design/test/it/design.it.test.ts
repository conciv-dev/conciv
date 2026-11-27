import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {listerPlugin} from '@internal/engine-kit'

describe('the design plugin is configured', () => {
  test('the engine lists the design plugin active with its engine and browser parts when its options are valid, and failed with the option it refused', async ({
    createEngine,
  }) => {
    const engine = await createEngine({
      plugins: [listerPlugin, ['@conciv/plugin-design', {comparator: 'pixelmatch', catalog: {appTierFull: 8}}]],
    })

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          id: 'design',
          state: {status: 'active'},
          features: {server: true, experimental: true},
        }),
      ]),
    })

    const refused = await createEngine({plugins: [listerPlugin, ['@conciv/plugin-design', {comparator: 'eyeball'}]]})

    expect(await refused.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          id: 'design',
          state: expect.objectContaining({status: 'failed', error: expect.stringContaining('comparator')}),
        }),
      ]),
    })
  })
})
