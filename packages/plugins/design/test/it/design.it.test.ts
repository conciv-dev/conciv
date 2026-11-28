import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {listerPlugin} from '@internal/engine-kit'
import {copyFileSync, existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import {Effect, Layer} from 'effect'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import {makeRpcClient} from '@conciv/client'
import {startDesign} from '../../src/engine/start.js'
import {readFigmaKeyAsk} from '../../src/key/figma-key-text.js'
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
  test('with no key the agent is told the key is missing or reads the document and image it attaches, the FIGMA_API_KEY of the engine reads the frame and its assets, a key the user saves wins over it, and an attached document wins over REST', async ({
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
    const missing = await keyless.session.tool('design_get').failure({figma: hero})
    expect(missing).toMatchObject({message: expect.stringContaining('the Figma key is missing')})
    expect(readFigmaKeyAsk(missing.message)).toBe('Figma needs a key to read this frame.')
    const fixtures = join(import.meta.dirname, '..', 'fixtures')
    const narrow = 'https://www.figma.com/design/ATTACHED/Site?node-id=100-1480'
    copyFileSync(join(fixtures, 'figma-hero-390-nodes.json'), join(keyless.root, 'hero-390.json'))
    expect(await keyless.session.tool('design_get').failure({figma: narrow, document: 'hero-390.json'})).toMatchObject({
      message: expect.stringContaining('document goes with figma and image'),
    })
    expect(
      await keyless.session.tool('design_get').failure({figma: narrow, document: 'missing.json', image: 'missing.png'}),
    ).toMatchObject({message: expect.stringContaining('no Figma document at missing.json')})
    const attached = await keyless.session.tool('design_get').call({
      figma: narrow,
      document: 'hero-390.json',
      image: readFileSync(join(fixtures, 'figma-hero-390-render.png')).toString('base64'),
    })
    expect(attached).toMatchObject({
      root: '100:1480',
      nodes: expect.arrayContaining([expect.objectContaining({id: '100:1481', type: 'TEXT', within: '100:1480'})]),
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
    expect(readFigmaKeyAsk(refused.message)).toBe('Figma refused the saved key.')
    copyFileSync(join(fixtures, 'figma-hero-390-render.png'), join(engine.root, 'hero-390.png'))
    const hero390 = JSON.parse(readFileSync(join(fixtures, 'figma-hero-390-nodes.json'), 'utf8'))
    expect(await get.call({figma: narrow, document: hero390, image: 'hero-390.png'})).toEqual(attached)
    expect(JSON.stringify([got, refused])).not.toContain('figd_')
  })
})
