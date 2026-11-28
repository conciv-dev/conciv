import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {listerPlugin} from '@internal/engine-kit'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import {Effect, Layer} from 'effect'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import {makeRpcClient} from '@conciv/client'
import {startDesign} from '../../src/engine/start.js'
import {figmaFills, figmaFrame, figmaNetwork} from '../utils/figma-network.js'

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
  test('with no key the agent is told the key is missing, the FIGMA_API_KEY of the engine reads the frame and its assets, and a key the user saves wins over it', async ({
    createEngine,
  }) => {
    const accepted = 'figd_engine-env-key'
    const network = figmaNetwork({
      key: accepted,
      answers: [
        ...figmaFrame({name: 'hero-1440', fileKey: 'HERO', node: '100:1170'}),
        ...figmaFrame({name: 'hero-390', fileKey: 'HERO', node: '100:1480'}),
        ...figmaFills({fileKey: 'HERO', fixture: 'figma-image-fill.png'}),
      ],
    })
    const design = Plugin.define({
      id: 'design',
      effect: (ctx) => startDesign(ctx).pipe(Effect.provide(Layer.merge(network, NodeServices.layer)), Effect.orDie),
    })
    const hero = 'https://www.figma.com/design/HERO/Site?node-id=100-1170'

    const keyless = await createEngine({}, {plugins: [design]})
    expect(await keyless.session.tool('design_get').failure({})).toMatchObject({
      message: expect.stringContaining('no design is registered'),
    })
    expect(
      await keyless.session.tool('design_get').failure({figma: 'https://www.figma.com/design/HERO/Site'}),
    ).toMatchObject({
      message: expect.stringContaining('must point at a frame'),
    })
    expect(await keyless.session.tool('design_get').failure({figma: hero})).toMatchObject({
      message: expect.stringContaining('the Figma key is missing'),
    })

    const engine = await createEngine({}, {plugins: [design], env: {FIGMA_API_KEY: accepted}})
    const get = engine.session.tool('design_get')
    const got = await get.call({figma: hero, route: '/'})
    expect(got).toMatchObject({
      target: expect.stringMatching(/^[0-9a-f]{12}$/),
      root: '100:1170',
      viewport: {width: 1280, height: 280},
      nodes: expect.arrayContaining([
        expect.objectContaining({id: '100:1170', asset: '/design/100-1170.png', image: true}),
        expect.objectContaining({id: '100:1171', type: 'TEXT', within: '100:1170'}),
      ]),
    })
    expect(existsSync(join(engine.root, 'public', 'design', '100-1170.png'))).toBe(true)
    expect(await get.call({})).toEqual(got)

    const rpc = makeRpcClient(engine.address.apiBase, {token: engine.address.token})
    await rpc.integration.connect.key({integrationId: 'figma', key: 'figd_saved-by-the-user'})
    const refused = await get.failure({figma: 'https://www.figma.com/design/HERO/Site?node-id=100-1480'})
    expect(refused).toMatchObject({message: expect.stringContaining('Figma refused the token: Invalid token')})
    expect(JSON.stringify([got, refused])).not.toContain('figd_')
  })
})
