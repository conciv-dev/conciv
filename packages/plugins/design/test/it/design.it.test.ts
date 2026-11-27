import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {listerPlugin} from '@internal/engine-kit'
import pricing from '../fixtures/figma-pricing-nodes.json' with {type: 'json'}

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

describe('the agent reads a Figma frame with design_get', () => {
  test('without a token the agent is told to pass the document, gets the design back from it, and later calls return the stored design', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-design']})
    const get = engine.session.tool('design_get')
    const link = 'https://www.figma.com/design/FILEKEY/Shop?node-id=1-2'

    expect(await get.failure({})).toMatchObject({message: expect.stringContaining('no design is registered')})
    expect(await get.failure({figma: link})).toMatchObject({message: expect.stringContaining('figma.token')})
    expect(await get.failure({figma: 'https://www.figma.com/design/FILEKEY/Shop'})).toMatchObject({
      message: expect.stringContaining('must point at a frame'),
    })

    const got = await get.call({figma: link, document: pricing, route: '/pricing'})
    expect(got).toMatchObject({
      target: expect.stringMatching(/^[0-9a-f]{12}$/),
      root: '1:2',
      count: 18,
      viewport: {width: 1440, height: 900},
      rules: expect.arrayContaining([expect.stringContaining('desktop first at 1440 wide')]),
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'w:1:7',
          within: '1:2',
          implied: true,
          reflow: {kind: 'stack', minChildWidth: 210},
        }),
        expect.objectContaining({
          id: '1:12',
          type: 'TEXT',
          name: 'Price',
          within: '1:10',
          depth: 3,
          text: '$12',
          font: expect.objectContaining({family: 'Inter', size: 48, lineHeight: {unit: 'PIXELS', value: 60}}),
        }),
      ]),
    })
    expect(await get.call({})).toEqual(got)
    expect(await get.call({figma: link})).toEqual(got)
  })
})
