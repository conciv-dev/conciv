import {describe, expect, onTestFinished, test} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Dynamic} from 'solid-js/web'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent acts on the page during a reply', () => {
  test('the click and the restyle fold into one card, and the screenshot reaches the agent as an image', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_click({selector: '#buy'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_setstyle({selector: '#buy', prop: 'color', value: 'red'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {typescriptCode: 'return await external_page_screenshot({})'}),
      TestLLM.text('The button is red now'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The button is red now')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Edited the page')).toBeVisible()
    expect(within(reply).getByText('2 actions')).toBeVisible()
    expect(within(reply).getByText('Clicked')).toBeVisible()
    expect(within(reply).getByText('Styled an element')).toBeVisible()
    await expect
      .element(
        page.getByRole('article', {name: 'Reply to: Explain this page'}).getByText('Buy the fern', {exact: true}),
      )
      .toHaveLength(2)
    expect(within(reply).getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    const [, , , answer] = await engine.requests()
    const shot = answer?.messages.find((message) => message.toolCallId === 'c3')
    expect(JSON.parse(String(shot?.content))).toMatchObject({
      files: [{type: 'image', source: {type: 'data', mimeType: 'image/webp'}}],
    })
  })
})

describe('the user stops the agent from the page', () => {
  test('two clicks on the page while the agent works stop the reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_click({selector: '#buy'})",
      }),
      TestLLM.text('Never shown'),
    )
    const click = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await click.started
    const answer = await engine.gate()
    await click.release()
    await answer.started
    const mask = await screen.findByRole('status', {name: 'Agent is using this page'})
    await user.click(mask)
    await user.click(mask)

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    await answer.release()
    await engine.reply(TestLLM.text('Back at it'))
    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Go on')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Back at it')).toBeVisible()
    expect(screen.queryByText('Never shown')).not.toBeInTheDocument()
  })
})

describe('the agent leaves the page alone for a while', () => {
  test("with a short page task timeout the agent's mask goes away on its own while the reply still waits", async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_click({selector: '#buy'})",
      }),
      TestLLM.text('Clicked'),
    )
    const click = await engine.gate()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
      timings: {page: {taskTimeoutMs: 50}},
    })
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await click.started
    const answer = await engine.gate()
    const masked = screen.findByRole('status', {name: 'Agent is using this page'})
    await click.release()
    const mask = await masked
    await answer.started

    await expect.element(mask).not.toBeInTheDocument()
    await answer.release()
    expect(await screen.findByText('Clicked')).toBeVisible()
  })
})

describe('the agent fills in a form on the page', () => {
  test('the agent types, picks, ticks and submits an order, and the host page takes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_fill({selector: '#name', value: 'Ada'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_select({selector: '#size', value: 'Large'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_page_check({selector: '#gift'})",
      }),
      TestLLM.toolCall('c4', 'execute_typescript', {
        typescriptCode: "return await external_page_uncheck({selector: '#news'})",
      }),
      TestLLM.toolCall('c5', 'execute_typescript', {
        typescriptCode: "return await external_page_submit({selector: '#name'})",
      }),
      TestLLM.text('The order is placed'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const order = new FormData(event.currentTarget)
          event.currentTarget.append(
            `Order placed for ${String(order.get('name'))}, ${String(order.get('size'))} pot, ${order.get('gift') ? 'gift wrapped' : 'no wrap'}, ${order.get('news') ? 'with news' : 'no news'}`,
          )
        }}
      >
        <label>
          Your name
          <input id="name" name="name" />
        </label>
        <label>
          Pot size
          <select id="size" name="size">
            <option value="small">Small</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label>
          <input id="gift" name="gift" type="checkbox" />
          Gift wrap
        </label>
        <label>
          <input id="news" name="news" type="checkbox" checked />
          Send me news
        </label>
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The order is placed')).toBeVisible()
    expect(screen.getByRole('textbox', {name: 'Your name'})).toHaveValue('Ada')
    expect(screen.getByRole('combobox', {name: 'Pot size'})).toHaveValue('large')
    expect(screen.getByRole('checkbox', {name: 'Gift wrap'})).toBeChecked()
    expect(screen.getByRole('checkbox', {name: 'Send me news'})).not.toBeChecked()
    expect(screen.getByText('Order placed for Ada, large pot, gift wrapped, no news')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(within(reply).getByRole('list')).getAllByRole('listitem')).toHaveLength(5)
    expect(within(reply).getByText('Typed')).toBeVisible()
    expect(within(reply).getByText('Selected')).toBeVisible()
    expect(within(reply).getByText('Checked a box')).toBeVisible()
    expect(within(reply).getByText('Unchecked a box')).toBeVisible()
    expect(within(reply).getByText('Submitted the form')).toBeVisible()
  })

  test('the agent fills a whole form in one call and writes into an editable note', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_page_fill_form({fields: [{type: 'text', selector: '#street', value: '12 Fern Lane'}, {type: 'select', selector: '#day', value: 'Tuesday'}, {type: 'check', selector: '#door', checked: true}]})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_fill({selector: '#note', value: 'Happy birthday'})",
      }),
      TestLLM.text('The delivery is filled in'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form>
        <label>
          Street
          <input id="street" />
        </label>
        <label>
          Delivery day
          <select id="day">
            <option value="monday">Monday</option>
            <option value="tuesday">Tuesday</option>
          </select>
        </label>
        <label>
          <input id="door" type="checkbox" />
          Leave at the door
        </label>
        <div id="note" role="textbox" aria-label="Gift note" contentEditable />
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The delivery is filled in')).toBeVisible()
    expect(screen.getByRole('textbox', {name: 'Street'})).toHaveValue('12 Fern Lane')
    expect(screen.getByRole('combobox', {name: 'Delivery day'})).toHaveValue('tuesday')
    expect(screen.getByRole('checkbox', {name: 'Leave at the door'})).toBeChecked()
    expect(screen.getByRole('textbox', {name: 'Gift note'})).toHaveTextContent('Happy birthday')
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Filled the form')).toBeVisible()
    expect(within(reply).getByText('Typed')).toBeVisible()
  })

  test('the agent reads the controls, then types and clicks by the refs the snapshot gave', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_snapshot({selector: '#signup'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_fill({ref: 'v1', value: 'ada@example.com'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_page_click({ref: 'v2'})",
      }),
      TestLLM.text('You are signed up'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form
        id="signup"
        onSubmit={(event) => {
          event.preventDefault()
          event.currentTarget.append(`Thanks for joining, ${String(new FormData(event.currentTarget).get('email'))}`)
        }}
      >
        <input name="email" aria-label="Email" />
        <button type="submit">Join</button>
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('You are signed up')).toBeVisible()
    expect(screen.getByText('Thanks for joining, ada@example.com')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Captured a snapshot')).toBeVisible()
    expect(within(reply).getByText('Clicked')).toBeVisible()
  })
})

describe('the agent moves around the page', () => {
  test('the agent hovers a button, presses Enter in a search field and scrolls to the reviews', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_hover({selector: '#shipping'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_fill({selector: '#search', value: 'ferns'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_page_press({selector: '#search', key: 'Enter'})",
      }),
      TestLLM.toolCall('c4', 'execute_typescript', {
        typescriptCode: "return await external_page_scroll({selector: '#reviews'})",
      }),
      TestLLM.text('Shipping is free over 50 dollars'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <main>
        <button
          id="shipping"
          type="button"
          onMouseEnter={(event) => event.currentTarget.nextElementSibling?.removeAttribute('hidden')}
        >
          Shipping
        </button>
        <p hidden>Free shipping over $50</p>
        <input
          id="search"
          aria-label="Search plants"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.nextElementSibling?.removeAttribute('hidden')
          }}
        />
        <p hidden>Results for ferns</p>
        <div style={{height: '300vh'}} />
        <h2 id="reviews">Reviews</h2>
      </main>
    ))
    const reviews = page.getByRole('heading', {name: 'Reviews'})
    await expect.element(reviews).not.toBeInViewport()

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('Shipping is free over 50 dollars')).toBeVisible()
    expect(screen.getByText('Free shipping over $50')).toBeVisible()
    expect(screen.getByText('Results for ferns')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Hovered')).toBeVisible()
    expect(within(reply).getByText('Pressed')).toBeVisible()
    expect(within(reply).getByText('Scrolled')).toBeVisible()
    await expect.element(reviews).toBeInViewport()
  })

  test('the agent plays a list of actions in one call and the page answers each', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_page_queue({actions: [{tool: 'page_fill', selector: '#name', value: 'Ada'}, {tool: 'page_click', selector: '#save'}]})",
      }),
      TestLLM.text('Your name is saved'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.currentTarget.append(`Saved ${String(new FormData(event.currentTarget).get('name'))}`)
        }}
      >
        <input id="name" name="name" aria-label="Your name" />
        <button id="save" type="submit">
          Save
        </button>
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('Your name is saved')).toBeVisible()
    expect(screen.getByText('Saved Ada')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Played page actions')).toBeVisible()
  })

  test('the agent queues the actions, answers at once, and the page plays them after', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_page_queue_async({actions: [{tool: 'page_fill', selector: '#name', value: 'Ada'}, {tool: 'page_click', selector: '#save'}]})",
      }),
      TestLLM.text('Saving your name'),
    )
    const finished = await engine.event('session.execution.succeeded')
    const played = await engine.event('rpc.experimental.page.queue.finished')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.currentTarget.append(`Saved ${String(new FormData(event.currentTarget).get('name'))}`)
        }}
      >
        <input id="name" name="name" aria-label="Your name" />
        <button id="save" type="submit">
          Save
        </button>
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('Saving your name')).toBeVisible()
    await played.arrived
    expect(screen.getByText('Saved Ada')).toBeVisible()
    await expect
      .element(
        page
          .getByRole('article', {name: 'Reply to: Explain this page'})
          .getByText('Queued page actions', {exact: true}),
      )
      .toHaveLength(2)
  })

  test('a queued action the page does not confirm in time comes back lost, as it may already have run', async () => {
    const engine = await createEngine({}, {timeouts: {queuedActionTimeoutMs: 1}})
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button id="buy" type="button">
        Buy the fern
      </button>
    ))

    expect(
      await engine.session.tool('page_queue').call({actions: [{tool: 'page_click', selector: '#buy'}]}),
    ).toMatchObject({
      status: 'lost',
      outcomes: [
        {
          index: 0,
          tool: 'page_click',
          ok: false,
          error: 'the page did not confirm page_click in time; it may already have run',
        },
      ],
    })
  })
})

describe('the agent edits the page', () => {
  test('a class, new text and a stylesheet change what the user sees, in one edit card', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_addclass({selector: '#fern', class: 'sold-out'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_settext({selector: '#title', text: 'Fern shop'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_page_css({text: '#promo { display: none }'})",
      }),
      TestLLM.text('The shop is updated'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    const host = render(() => (
      <main>
        <style>{'.sold-out { display: none }'}</style>
        <h1 id="title">Plant shop</h1>
        <p id="promo">Spring sale</p>
        <p id="fern">Boston fern</p>
        <p>Snake plant</p>
      </main>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The shop is updated')).toBeVisible()
    expect(within(host.container).getByRole('heading', {name: 'Fern shop'})).toBeVisible()
    expect(within(host.container).getByText('Boston fern')).not.toBeVisible()
    expect(within(host.container).getByText('Spring sale')).not.toBeVisible()
    expect(within(host.container).getByText('Snake plant')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Edited the page')).toBeVisible()
    expect(within(within(reply).getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(within(reply).getByText('Added a class')).toBeVisible()
    expect(within(reply).getByText('Set the text')).toBeVisible()
    expect(within(reply).getByText('Injected CSS')).toBeVisible()
  })
})

describe('the element inspector', () => {
  test('the user holds Alt to inspect the page and Esc leaves it', async () => {
    await page.viewport(1280, 800)
    onTestFinished(() => page.viewport(414, 896))
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))
    const buy = screen.getByRole('button', {name: 'Buy the fern'})
    await user.click(buy)
    expect(buy).toHaveFocus()

    await user.keyboard('{Alt>}')
    await expect.element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true})).toBeVisible()
    await user.keyboard('{Escape}')

    await expect
      .element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}))
      .not.toBeInTheDocument()
    await user.keyboard('{/Alt}')
    expect(buy).toHaveFocus()
    expect(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}).query()).toBeNull()
  })

  test('the agent turns the highlight effect on and the inspector opens on the page', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_effect({action: 'enable', effect: 'highlight'})",
      }),
      TestLLM.text('The highlight is on'),
    )
    const finished = await engine.event('session.execution.succeeded')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await finished.arrived

    expect(await screen.findByText('The highlight is on')).toBeVisible()
    await expect.element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true})).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Drove an effect')).toBeVisible()
  })
})

describe('the page follows the session the user switches to', () => {
  test('after a switch the page answers the session the user picked and the old one is told it is gone', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const alpha = await engine.newSession('Alpha')
    const bravo = await engine.newSession('Bravo')
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    expect(await bravo.tool('page_route').call({})).toMatchObject({pathname: '/'})

    const again = await engine.event('rpc.experimental.page.control')
    await user.click(await screen.findByRole('button', {name: 'Bravo, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Bravo'}))
    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))
    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    await again.arrived

    expect(await alpha.tool('page_route').call({})).toMatchObject({pathname: '/'})
    expect(await bravo.tool('page_route').failure({})).toMatchObject({
      message: expect.stringContaining("'external_page_route' is not defined"),
    })
  })
})

describe('the user grabs an element for the agent', () => {
  test('the picked element is staged in the composer, which takes focus, and is sent with the message to the agent', async () => {
    await page.viewport(1280, 800)
    onTestFinished(() => page.viewport(414, 896))
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(TestLLM.text('That button buys the fern'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Select an element from the page'}))
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    expect(await screen.findByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    expect(screen.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveFocus()
    await user.keyboard('What does this do?')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('That button buys the fern')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    const [request] = await engine.requests()
    expect(JSON.stringify(request?.messages)).toContain('Buy the fern')
  })
})

describe('the agent reads a page with shadow roots of its own', () => {
  test('the agent reads into the host shadow root and never into the widget overlay', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <section
        id="card"
        ref={(card) => {
          card
            .attachShadow({mode: 'open'})
            .append(Object.assign(document.createElement('p'), {id: 'inside', textContent: 'Water once a week'}))
        }}
      />
    ))
    expect(await engine.session.tool('page_effect').call({action: 'enable', effect: 'highlight'})).toMatchObject({
      enabled: true,
    })
    await expect.element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true})).toBeVisible()

    expect(await engine.session.tool('page_text').call({selector: '#inside'})).toEqual({text: 'Water once a week'})
    expect(await engine.session.tool('page_exists').call({selector: 'kbd'})).toEqual({exists: false, count: 0})
  })
})

describe('the agent reads the address of a tab with secrets in it', () => {
  test('the tab list and the route read both hide the token in the query and in the hash and keep the rest', async () => {
    const engine = await createEngine()
    const address = new URL(location.href)
    history.replaceState(null, '', `${address.pathname}?plant=fern&token=abc123#jwt=xyz789`)
    onTestFinished(() => history.replaceState(null, '', address.href))
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('page_tabs_list').call({})).toMatchObject({
      tabs: [{url: `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`}],
    })
    expect(await engine.session.tool('page_route').call({})).toMatchObject({
      pathname: address.pathname,
      search: '?plant=fern&token=%5Bredacted%5D',
      href: `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`,
    })
  })
})

describe('a plugin adds its own page operation', () => {
  test('the operation reads the page, and a name no plugin registered is refused', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/basket-reader']})
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    expect(await screen.findByText('Basket reader ready')).toBeVisible()
    render(() => (
      <ul id="basket">
        <li>Boston fern</li>
        <li>Snake plant</li>
      </ul>
    ))

    expect(
      await engine.rpc.call('experimental.page', 'operate', {
        sessionId: engine.session.id,
        name: 'basket.read',
        input: {},
        reading: true,
      }),
    ).toEqual({plants: ['Boston fern', 'Snake plant']})
    expect(
      await engine.rpc.failure('experimental.page', 'operate', {
        sessionId: engine.session.id,
        name: 'basket.empty',
        input: {},
        reading: false,
      }),
    ).toMatchObject({message: expect.stringContaining('This page does not support the requested page operation')})
  })
})

describe('the agent finds the tab through the TanStack plugin', () => {
  test('the TanStack tab list names the focused tab and a TanStack page operation with wrong input is refused', async () => {
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']})
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('tanstack_tabs_list').call({})).toMatchObject({
      tabs: [{focused: true, visible: true}],
    })
    expect(await engine.session.tool('tanstack_navigate').failure({to: 7})).toMatchObject({
      message: expect.stringContaining(
        'Invalid arguments for tool \\"tanstack_navigate\\":\\n- to: Invalid input: expected string, received number',
      ),
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
    const address = new URL(location.href)
    history.replaceState(null, '', address.pathname)
    onTestFinished(() => history.replaceState(null, '', address.href))
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    expect(await engine.session.tool('page_tabs_list').call({})).toMatchObject({
      tabs: [{url: `${address.origin}${address.pathname}`, focused: true, visible: true}],
    })
    expect(await engine.session.tool('page_route').call({})).toEqual({
      pathname: address.pathname,
      search: '',
      href: `${address.origin}${address.pathname}`,
      title: document.title,
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
    expect(within(read).getByText('Read the text')).toBeVisible()
    expect(within(read).getByText('#plants')).toBeVisible()
    expect(within(read).getByRole('img', {name: 'succeeded'})).toBeVisible()
    const failed = within(reply).getByRole('button', {name: /Page text/})
    expect(within(failed).getByText('[page.invalid-args] no element for selector #sold-out')).toBeVisible()
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
