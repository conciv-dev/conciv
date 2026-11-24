import {describe, expect} from 'vitest'
import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin-host'
import {PluginEngine, testEffect} from '@conciv/plugin-testkit'

describe('the agent reads the TanStack dev server', () => {
  const it = testEffect(PluginEngine.layer({plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 1}]]}))

  it.live(
    'the route manifest is unreadable until routeTree.gen exists, build errors need the dev server, and the server function trace starts empty, through the tools and the rpc',
    () =>
      Effect.gen(function* () {
        const session = yield* PluginEngine.session()

        expect(yield* session.tool('tanstack_route_manifest').failure()).toMatchObject({
          message: expect.stringContaining('routeTree.gen.ts'),
        })
        expect(yield* PluginEngine.failure('experimental.tanstack', 'routeManifest')).toMatchObject({
          type: 'MANIFEST_UNREADABLE',
        })

        yield* PluginEngine.write('src/routes/plants.$plantId.tsx', 'export const Route = {}\n')
        yield* PluginEngine.write(
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
        expect(yield* session.tool('tanstack_route_manifest').call()).toEqual(manifest)
        expect(yield* PluginEngine.call('experimental.tanstack', 'routeManifest')).toEqual(manifest)

        expect(yield* session.tool('tanstack_build_errors').failure()).toMatchObject({
          message: expect.stringContaining('bundler bridge unavailable'),
        })
        expect(yield* PluginEngine.failure('experimental.tanstack', 'buildErrors')).toMatchObject({
          type: 'BUNDLER_UNAVAILABLE',
          message: 'bundler bridge unavailable',
        })

        expect(yield* session.tool('tanstack_server_fn_trace').call()).toEqual({traces: [], functions: []})
        expect(yield* PluginEngine.call('experimental.tanstack', 'serverFnTrace', {count: 5})).toEqual({
          traces: [],
          functions: [],
        })
      }),
  )
})

describe('the agent works with the TanStack plugin and no page open', () => {
  const it = testEffect(PluginEngine.layer({plugins: ['@conciv/plugin-page', '@conciv/plugin-tanstack']}))

  it.live(
    'the TanStack skill is listed for the model, and with no page open a page operation fails and says to open the page',
    () =>
      Effect.gen(function* () {
        const session = yield* PluginEngine.session()

        expect(yield* PluginEngine.skills()).toContain('    <id>tanstack</id>')
        expect(yield* session.tool('tanstack_router_state').failure()).toMatchObject({
          message: expect.stringContaining('[page.disconnected] No page is open in this session.'),
        })
      }),
  )
})

describe('the TanStack plugin is configured', () => {
  const it = testEffect(PluginEngine.layer({plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 0}]]}))

  it.live('a wrong bundlerWaitMs fails the plugin, and the failure names the option it refused', () =>
    Effect.gen(function* () {
      yield* Plugin.awaitActivation
      const plugins = yield* Plugin.Service.use((registry) => registry.list())

      expect(plugins.find((plugin) => plugin.id === 'tanstack')?.state).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('bundlerWaitMs'),
      })
    }),
  )
})
