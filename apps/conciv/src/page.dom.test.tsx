import {describe, expect, test} from 'vitest'
import {render, screen} from '@solidjs/testing-library'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent reads a page with a one-time code filled in', () => {
  test('the value and the snapshot give the code as masked', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form id="verify">
        <label>
          Code <input name="code" autocomplete="one-time-code" value="123456" />
        </label>
      </form>
    ))

    expect(screen.getByRole('textbox', {name: 'Code'})).toHaveValue('123456')

    expect(await engine.session.tool('page_value').call({selector: '#verify input'})).toEqual({value: '***'})
    expect(await engine.session.tool('page_snapshot').call({selector: '#verify'})).toMatchObject({
      nodes: [
        {role: 'label', name: 'Code'},
        {role: 'textbox', name: 'Code', value: '***'},
      ],
    })
  })
})
