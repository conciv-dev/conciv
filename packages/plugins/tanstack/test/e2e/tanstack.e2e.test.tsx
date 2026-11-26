import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {screen, within} from '@solidjs/testing-library'
import {createExtensionTester} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import {pageTestPlugin} from '@conciv/plugin-page/test-utils'
import tanstack from '../../src/plugin-experimental.js'

describe('the TanStack cards', () => {
  test('the route manifest card opens by default, counts and lists the routes, and the server-function card opens by default and says there are no calls yet', async () => {
    const card = (tool: string, output: unknown) => ({
      tool,
      input: {},
      metadata: {},
      status: 'completed',
      output: JSON.stringify(output),
    })
    await createExtensionTester({plugins: [{id: '@conciv/plugin-tanstack', plugin: tanstack}]}).renderToolCards(
      card('tanstack_route_manifest', [
        {path: '/', kind: 'layout', dynamic: false, file: '/workspace/src/routes/__root'},
        {path: '/plants/$plantId', kind: 'page', dynamic: true, file: '/workspace/src/routes/plants.$plantId.tsx'},
      ]),
      card('tanstack_server_fn_trace', {traces: [], functions: []}),
    )

    const cards = screen.getByRole('list', {name: 'Tool cards'})
    const manifest = within(cards).getByRole('button', {name: /Read the route manifest/, expanded: true})
    expect(within(manifest).getByText('Read the route manifest')).toBeVisible()
    expect(within(manifest).getByText('2 routes')).toBeVisible()
    expect(within(cards).getByText('/plants/$plantId')).toBeVisible()
    const calls = within(cards).getByRole('button', {name: /Read the server-function calls/, expanded: true})
    expect(within(calls).getByText('Read the server-function calls')).toBeVisible()
    expect(within(calls).getByText('no calls')).toBeVisible()
    expect(within(cards).getByText('No server-fn calls')).toBeVisible()
  })
})

describe('the agent finds the tab through the TanStack plugin', () => {
  test('the TanStack tab list names the focused tab', async ({createEngine}) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']}, {plugins: ['@conciv/plugin-page']})
    const control = await engine.event('rpc.experimental.page.control')
    await renderTestApp({
      engine,
      plugins: [pageTestPlugin],
    })
    await control.arrived

    expect(await engine.session.tool('tanstack_tabs_list').call({})).toMatchObject({
      tabs: [{focused: true, visible: true}],
    })
  })
})
