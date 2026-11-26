import {glob, readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createGenerator} from 'unocss'
import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {TestLLM} from '@conciv/backend-test-utils'
import page from '@conciv/plugin-page'
import {listerPlugin} from '@internal/engine-kit'
import pluginUnoConfig from '../../uno.config.js'

describe('the agent reads the TanStack dev server', () => {
  test('the route manifest is unreadable until routeTree.gen exists, build errors need the dev server, and the server function trace starts empty, through the tools and the rpc', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 1}]]})

    expect(await engine.session.tool('tanstack_route_manifest').failure({})).toMatchObject({
      message: expect.stringContaining('routeTree.gen.ts'),
    })
    expect(await engine.rpc.failure('experimental.tanstack', 'routeManifest')).toMatchObject({
      type: 'MANIFEST_UNREADABLE',
    })

    await engine.write('src/routes/plants.$plantId.tsx', 'export const Route = {}\n')
    await engine.write(
      'src/routeTree.gen.ts',
      [
        "import { Route as rootRouteImport } from './routes/__root'",
        "import { Route as ShopRouteImport } from './routes/_shop'",
        "import { Route as PlantsPlantIdRouteImport } from './routes/plants.$plantId'",
        'const ShopRoute = ShopRouteImport.update({',
        "  id: '/_shop',",
        '  getParentRoute: () => rootRouteImport,',
        '} as any)',
        'const PlantsPlantIdRoute = PlantsPlantIdRouteImport.update({',
        "  id: '/plants/$plantId',",
        "  path: '/plants/$plantId',",
        '  getParentRoute: () => ShopRoute,',
        '} as any)',
        '',
      ].join('\n'),
    )
    const manifest = [
      {path: '/', kind: 'layout', dynamic: false, file: expect.stringMatching(/\/src\/routes\/__root$/)},
      {path: '/_shop', kind: 'layout', dynamic: false, file: expect.stringMatching(/\/src\/routes\/_shop$/)},
      {
        path: '/plants/$plantId',
        kind: 'page',
        dynamic: true,
        file: expect.stringMatching(/\/src\/routes\/plants\.\$plantId\.tsx$/),
      },
    ]
    expect(await engine.session.tool('tanstack_route_manifest').call({})).toEqual(manifest)
    expect(await engine.rpc.call('experimental.tanstack', 'routeManifest')).toEqual(manifest)

    expect(await engine.session.tool('tanstack_build_errors').failure({})).toMatchObject({
      message: expect.stringContaining('bundler bridge unavailable'),
    })
    expect(await engine.rpc.failure('experimental.tanstack', 'buildErrors')).toMatchObject({
      type: 'BUNDLER_UNAVAILABLE',
      message: 'bundler bridge unavailable',
    })

    expect(await engine.session.tool('tanstack_server_fn_trace').call({})).toEqual({traces: [], functions: []})
    expect(await engine.rpc.call('experimental.tanstack', 'serverFnTrace', {count: 5})).toEqual({
      traces: [],
      functions: [],
    })
  })
})

describe('the agent works with the TanStack plugin and no page open', () => {
  test('the TanStack skill reaches the model, and with no page open the page operations are not offered', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']}, {plugins: [page]})
    await engine.reply(TestLLM.text('Your app uses TanStack Router'))

    await engine.session.send('What router does my app use?')

    const [request] = await engine.requests()
    expect(request?.system.join('\n')).toContain('    <id>tanstack</id>')

    expect(await engine.session.tool('tanstack_router_state').failure({})).toMatchObject({
      message: expect.stringContaining("'external_tanstack_router_state' is not defined"),
    })
  })
})

describe('the TanStack plugin is configured', () => {
  test('a wrong bundlerWaitMs fails the plugin and the engine lists the option it refused', async ({createEngine}) => {
    const engine = await createEngine({
      plugins: [listerPlugin, ['@conciv/plugin-tanstack', {bundlerWaitMs: 0}]],
    })

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          state: expect.objectContaining({status: 'failed', error: expect.stringContaining('bundlerWaitMs')}),
        }),
      ]),
    })
  })
})

describe('the plugin brings a stylesheet of its own utilities, merged into the app sheet', () => {
  test('the sheet holds a rule for each class the plugin source uses, and no reset, theme block or loader preflight of the app', async () => {
    const generator = await createGenerator(pluginUnoConfig)
    const tokens = new Set<string>()
    const pattern = fileURLToPath(new URL('../../src/**/*.{ts,tsx}', import.meta.url))
    for await (const file of glob(pattern)) await generator.applyExtractors(await readFile(file, 'utf8'), file, tokens)
    const {css} = await generator.generate(tokens)

    expect(css).toContain('.whitespace-nowrap{')
    expect(css).toContain('@property --unx-ring-shadow')
    expect(css).not.toMatch(/:root|:host|box-sizing|@keyframes chat-loader/)
  })
})
