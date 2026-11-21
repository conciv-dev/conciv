import {describe, expect, test} from 'vitest'
import {render, screen} from '@solidjs/testing-library'
import {Dynamic} from 'solid-js/web'
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

describe('the agent reads a page with an element named after a built-in', () => {
  test('the snapshot lists only the real controls', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <section id="sale">
        <Dynamic component="constructor">Spring sale</Dynamic>
        <button type="button">Buy</button>
      </section>
    ))

    expect(screen.getByRole('button', {name: 'Buy'})).toBeVisible()
    expect(await engine.session.tool('page_snapshot').call({selector: '#sale'})).toMatchObject({
      nodes: [{role: 'button', name: 'Buy'}],
    })
  })
})

describe('the agent picks an element on a page with the widget open on it', () => {
  test('a selector that also matches the widget picks the host element only', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => <button type="button">Buy the fern</button>)

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(await engine.session.tool('page_text').call({selector: 'button'})).toEqual({text: 'Buy the fern'})
  })
})
