import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import {mount, pluginEngine} from '@conciv/plugin-testkit/browser'
import tanstack from './plugin-experimental.js'

describe('the agent reads the TanStack plugin', () => {
  test('the route manifest card lists the routes the tool answered, and the server function card shows none yet', async () => {
    const engine = await pluginEngine({plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 1}]]})
    await engine.write('src/routes/plants.$plantId.tsx', 'export const Route = {}\n')
    await engine.write(
      'src/routeTree.gen.ts',
      [
        "import { Route as rootRouteImport } from './routes/__root'",
        "import { Route as PlantsPlantIdRouteImport } from './routes/plants.$plantId'",
        'const PlantsPlantIdRoute = PlantsPlantIdRouteImport.update({',
        "  id: '/plants/$plantId',",
        "  path: '/plants/$plantId',",
        '  getParentRoute: () => rootRouteImport,',
        '} as any)',
        '',
      ].join('\n'),
    )
    const manifest = await engine.tool('tanstack_route_manifest').call()
    const trace = await engine.tool('tanstack_server_fn_trace').call()

    await mount(tanstack, {
      id: '@conciv/plugin-tanstack',
      engine,
      tools: [
        {
          tool: 'tanstack_route_manifest',
          input: {},
          metadata: {},
          status: 'completed',
          output: JSON.stringify(manifest),
          defaultOpen: true,
        },
        {
          tool: 'tanstack_server_fn_trace',
          input: {},
          metadata: {},
          status: 'completed',
          output: JSON.stringify(trace),
          defaultOpen: true,
        },
      ],
    })

    const shell = screen.getByRole('main', {name: 'App shell'})
    const routes = await within(shell).findByRole('button', {name: /Read the route manifest/, expanded: true})
    expect(within(routes).getByText('2 routes')).toBeVisible()
    expect(within(shell).getByText('/plants/$plantId')).toBeVisible()
    const calls = within(shell).getByRole('button', {name: /Read the server-function calls/, expanded: true})
    expect(within(calls).getByText('no calls')).toBeVisible()
    expect(within(shell).getByText('No server-fn calls')).toBeVisible()
  })
})
