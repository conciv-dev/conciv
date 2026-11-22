import {describe, expect, test} from 'vitest'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Dynamic} from 'solid-js/web'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

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
    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await result).toEqual({result: 2})
  })

  test('the eval does not run when the user denies it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => <p id="price">12 euros</p>)

    const result = engine.session
      .tool('page_eval')
      .failure({code: "document.querySelector('#price').textContent = 'free'"})
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(within(ask).getByRole('button', {name: 'Deny'}))

    expect(await result).toMatchObject({message: expect.stringMatching(/denied/)})
    expect(screen.getByText('12 euros')).toBeVisible()
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

    const finished = await engine.event('session.execution.succeeded')
    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The fern is in stock')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    const read = within(reply).getByRole('button', {name: /Read the text/})
    expect(read).toHaveTextContent('Read the text#plants')
    expect(within(read).getByRole('img', {name: 'succeeded'})).toBeVisible()
    const failed = within(reply).getByRole('button', {name: /Page text/})
    expect(failed).toHaveTextContent('[page.invalid-args] no element for selector #sold-out')
  })
})

describe('the agent works on a page that is open', () => {
  test('with a page open the page tools and the page skill reach the agent and an outside agent finds them', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(TestLLM.text('This is the plant shop'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('This is the plant shop')).toBeVisible()
    const [request] = await engine.requests()
    const system = request?.system.join('\n')
    expect(system).toContain('external_page_click')
    expect(system).toContain('    <id>page</id>')
    const found = await engine.outside({tab: engine.session.id}).discover(['page_click'])
    expect(found).toMatchObject({content: [{type: 'text', text: expect.stringContaining('page_click')}]})
    expect(found).not.toMatchObject({content: [{type: 'text', text: expect.stringContaining('Unknown tool')}]})
  })

  test('the agent reads a plain attribute while a password and a one-time code stay masked in every read', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form id="login">
        <label>
          City <input id="city" name="city" placeholder="Lisbon" />
        </label>
        <label>
          Password <input id="password" name="password" type="password" value="hunter2" />
        </label>
        <label>
          Code <input id="code" name="code" autocomplete="one-time-code" value="123456" />
        </label>
      </form>
    ))

    expect(screen.getByRole('textbox', {name: 'Code'})).toHaveValue('123456')

    expect(await engine.session.tool('page_attr').call({selector: '#city', attribute: 'placeholder'})).toEqual({
      value: 'Lisbon',
    })
    expect(await engine.session.tool('page_value').call({selector: '#password'})).toEqual({value: '***'})
    expect(await engine.session.tool('page_value').call({selector: '#code'})).toEqual({value: '***'})
    expect(await engine.session.tool('page_attr').call({selector: '#password', attribute: 'value'})).toEqual({
      value: '***',
    })
    const markup = await engine.session.tool('page_dom').call({selector: '#login'})
    expect(markup).not.toMatchObject({html: expect.stringContaining('hunter2')})
    expect(markup).not.toMatchObject({html: expect.stringContaining('123456')})
    expect(await engine.session.tool('page_snapshot').call({selector: '#login'})).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({role: 'textbox', name: 'Password', value: '***'}),
        expect.objectContaining({role: 'textbox', name: 'Code', value: '***'}),
      ]),
    })
  })

  test('the agent reads what the page logged and waits for a toast the user brings up', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <main>
        <button
          type="button"
          onClick={(event) => {
            console.info('Fern added to cart')
            event.currentTarget.nextElementSibling?.removeAttribute('hidden')
          }}
        >
          Add the fern
        </button>
        <p id="toast" hidden>
          Added to your cart
        </p>
      </main>
    ))

    const waited = engine.session.tool('page_wait').call({selector: '#toast', state: 'visible'})
    await user.click(screen.getByRole('button', {name: 'Add the fern'}))

    expect(screen.getByText('Added to your cart')).toBeVisible()
    expect(await waited).toEqual({ok: true, state: 'visible'})
    expect(await engine.session.tool('page_console').call({})).toMatchObject({
      entries: expect.arrayContaining([expect.objectContaining({level: 'info', text: 'Fern added to cart'})]),
    })
  })

  test('a page call that outlasts the reply window comes back as a timeout', async () => {
    const engine = await createEngine({}, {timeouts: {pageReplyTimeoutMs: 500}})
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('page_wait').failure({selector: '#never', state: 'visible'})).toMatchObject({
      message: expect.stringContaining('[page.timeout] page.wait did not finish within 0.5 seconds'),
    })
  })
})

describe('the agent drives a page effect', () => {
  test('the highlight effect is listed off, turns on, reports itself on, and turns off again', async () => {
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

    expect(await engine.session.tool('page_effect').call({action: 'enable', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: true,
    })
    expect(await engine.session.tool('page_effect').call({action: 'report', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: true,
    })
    expect(await engine.session.tool('page_effect').call({action: 'disable', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: false,
    })
    expect(await engine.session.tool('page_effect').call({action: 'report', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: false,
    })
  })
})
