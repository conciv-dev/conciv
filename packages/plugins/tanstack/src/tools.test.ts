import {describe, expect, test} from 'vitest'
import {cli, createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('the agent reads the TanStack dev server', () => {
  test('the route manifest is unreadable until routeTree.gen exists, build errors need the dev server, and the server function trace starts empty, through the tools, the rpc and the CLI', async () => {
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
    const called = await cli(['plugin', 'call', 'experimental.tanstack', 'routeManifest'], {engine})
    expect(called.exitCode).toBe(0)
    expect(JSON.parse(called.stdout)).toEqual({ok: true, data: manifest})

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
  test('the TanStack skill reaches the model, and with no page open the page operations are not offered', async () => {
    const engine = await createEngine({plugins: ['@conciv/plugin-page', '@conciv/plugin-tanstack']})
    await engine.reply(TestLLM.text('Your app uses TanStack Router'))

    await engine.session.send('What router does my app use?')

    const [request] = await engine.requests()
    expect(request?.system.join('\n')).toContain('    <id>tanstack</id>')

    expect(await engine.session.tool('tanstack_router_state').failure({})).toMatchObject({
      message: expect.stringContaining("'external_tanstack_router_state' is not defined"),
    })
  })
})
