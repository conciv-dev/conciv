import {describe, expect, test} from 'vitest'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Dynamic} from 'solid-js/web'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
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

describe('the agent finds the tab and the route its page is on', () => {
  test('the tab list names the focused tab and the route reads its address', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('page_tabs_list').call({})).toMatchObject({
      tabs: [{url: 'http://localhost:3000/', focused: true, visible: true}],
    })
    expect(await engine.session.tool('page_route').call({})).toEqual({
      pathname: '/',
      search: '',
      href: 'http://localhost:3000/',
      title: '',
      state: 'visible',
    })
  })
})

describe('the agent reads host content', () => {
  test('exists, query, text and markup answer for the host section', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <section id="plants">
        <h2>Ferns</h2>
        <button type="button" id="buy">
          Buy the fern
        </button>
      </section>
    ))

    expect(screen.getByRole('heading', {name: 'Ferns'})).toBeVisible()
    expect(await engine.session.tool('page_exists').call({selector: '#plants button'})).toEqual({
      exists: true,
      count: 1,
    })
    expect(await engine.session.tool('page_query').call({selector: '#plants button'})).toMatchObject({
      count: 1,
      elements: [{tagName: 'button', id: 'buy'}],
    })
    expect(await engine.session.tool('page_text').call({selector: '#plants'})).toEqual({text: 'FernsBuy the fern'})
    expect(await engine.session.tool('page_dom').call({selector: '#plants'})).toEqual({
      html: '<section id="plants"><h2>Ferns</h2><button type="button" id="buy">Buy the fern</button></section>',
    })
  })
})

describe('the agent lists the effects it can run on the page', () => {
  test('the highlight effect is listed and off', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('page_effect').call({action: 'list'})).toEqual({
      effects: [
        {
          name: 'highlight',
          description: 'outline the element under the pointer and open its source on click',
          enabled: false,
        },
      ],
    })
  })
})

describe('the agent runs code on the page', () => {
  test('the eval asks first and runs once the user approves', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    const result = engine.session.tool('page_eval').call({code: 'return 1 + 1'})
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    expect(ask).toHaveTextContent('page_eval return 1 + 1')
    await user.click(within(ask).getByRole('button', {name: 'Approve'}))

    expect(await result).toEqual({result: 2})
  })
})

describe('the agent reads the page during a reply', () => {
  test('the thread shows a card for the read and one for the read that failed', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_text({selector: '#plants'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_text({selector: '#sold-out'})",
      }),
      TestLLM.text('The fern is in stock'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <section id="plants">
        <h2>Ferns</h2>
      </section>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('The fern is in stock')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    const read = within(reply).getByRole('button', {name: /Read the text/})
    expect(read).toHaveTextContent('Read the text#plants')
    expect(within(read).getByRole('img', {name: 'succeeded'})).toBeVisible()
    const failed = within(reply).getByRole('button', {name: /Page text/})
    expect(failed).toHaveTextContent('[page.invalid-args] no element for selector #sold-out')
  })
})
