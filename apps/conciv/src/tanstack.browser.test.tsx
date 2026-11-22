import {describe, expect, test} from 'vitest'
import {screen, waitFor, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent reads the TanStack plugin during a reply', () => {
  test('the thread shows a card for the route manifest and one for the server function calls with none yet', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']})
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
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: 'return await external_tanstack_route_manifest()'}),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: 'return await external_tanstack_server_fn_trace({})',
      }),
      TestLLM.text('Your app has a plant page'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const finished = await engine.event('session.execution.succeeded')
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Which pages are there')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await finished.arrived

    expect(await screen.findByText('Your app has a plant page')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Which pages are there'})
    const manifest = within(reply).getByRole('button', {name: /Read the route manifest/, expanded: true})
    expect(within(manifest).getByText('Read the route manifest')).toBeVisible()
    expect(within(manifest).getByText('2 routes')).toBeVisible()
    expect(within(reply).getByText('/plants/$plantId')).toBeVisible()
    const calls = within(reply).getByRole('button', {name: /Read the server-function calls/, expanded: true})
    expect(within(calls).getByText('Read the server-function calls')).toBeVisible()
    expect(within(calls).getByText('no calls')).toBeVisible()
    expect(within(reply).getByText('No server-fn calls')).toBeVisible()
  })
})

describe('the TanStack plugin is configured', () => {
  test('a wrong bundlerWaitMs shows the plugin failed in Settings with the option it refused', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 0}]]})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))

    expect(await screen.findByText(/bundlerWaitMs/)).toBeVisible()
    expect(screen.getByText('Failed')).toBeVisible()
  })
})

describe('a plugin draws its own icon', () => {
  test('the TanStack logo the plugin declares draws by name in its tool card and its status chip, and leaves with the plugin', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']})
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
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: 'return await external_tanstack_route_manifest()'}),
      TestLLM.text('Your app has a plant page'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const finished = await engine.event('session.execution.succeeded')
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Which pages are there')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await finished.arrived

    const card = await screen.findByRole('button', {name: /Read the route manifest/})
    const chip = screen.getByRole('status', {name: 'TanStack inspector active'})
    const href = card.querySelector('use')?.getAttribute('href') ?? ''
    expect(href).toMatch(/^#/)
    expect(chip.querySelector('use')).toHaveAttribute('href', href)
    const symbol = document.querySelector(`symbol${href}`)
    expect(symbol).toHaveAttribute('viewBox', '0 0 634 633')

    await user.click(screen.getByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    await user.click(await screen.findByRole('switch', {name: 'tanstack'}))

    await waitFor(() =>
      expect(screen.queryByRole('status', {name: 'TanStack inspector active'})).not.toBeInTheDocument(),
    )
    expect(document.querySelector(`symbol${href}`)).not.toBeInTheDocument()
  })
})
