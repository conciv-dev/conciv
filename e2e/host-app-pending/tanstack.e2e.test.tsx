import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'

describe('the agent finds the tab through the TanStack plugin', () => {
  test('the TanStack tab list names the focused tab', async ({createEngine}) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']})
    const control = await engine.event('rpc.experimental.page.control')
    await renderTestApp({engine, initialEntries: ['/panel/latest?open=true']})
    await control.arrived

    expect(await engine.session.tool('tanstack_tabs_list').call({})).toMatchObject({
      tabs: [{focused: true, visible: true}],
    })
  })
})
