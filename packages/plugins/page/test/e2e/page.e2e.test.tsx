import {describe, expect, test} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Dynamic} from 'solid-js/web'
import {FakeLLM} from '@conciv/client/testing'
import basketReader from '../fixtures/plugins/basket-reader.js'
import pageComment from '../fixtures/plugins/page-comment.js'
import {openPage} from '../utils/open-page.js'

describe('the agent acts on the page during a reply', () => {
  test('the agent clicks, restyles, hovers, presses, scrolls and edits the page in one card, and the screenshot reaches the agent as an image', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    engine.reply(
      pageRpc.toolCall('c1', 'page_click', {selector: '#buy'}),
      pageRpc.toolCall('c2', 'page_setstyle', {selector: '#buy', prop: 'color', value: 'red'}),
      pageRpc.toolCall('c3', 'page_hover', {selector: '#shipping'}),
      pageRpc.toolCall('c4', 'page_fill', {selector: '#search', value: 'ferns'}),
      pageRpc.toolCall('c5', 'page_press', {selector: '#search', key: 'Enter'}),
      pageRpc.toolCall('c6', 'page_scroll', {selector: '#reviews'}),
      pageRpc.toolCall('c7', 'page_addclass', {selector: '#fern', class: 'sold-out'}),
      pageRpc.toolCall('c8', 'page_settext', {selector: '#title', text: 'Fern shop'}),
      pageRpc.toolCall('c9', 'page_css', {text: '#promo { display: none }'}),
      pageRpc.toolCall('c10', 'page_screenshot', {}),
      FakeLLM.text('The shop is updated'),
    )
    const host = render(() => (
      <main>
        <style>{'.sold-out { display: none }'}</style>
        <h1 id="title">Plant shop</h1>
        <p id="promo">Spring sale</p>
        <p id="fern">Boston fern</p>
        <p>Snake plant</p>
        <button type="button" id="buy">
          Buy the fern
        </button>
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

    expect(await screen.findByText('The shop is updated')).toBeVisible()
    expect(within(host.container).getByRole('heading', {name: 'Fern shop'})).toBeVisible()
    expect(within(host.container).getByText('Boston fern')).not.toBeVisible()
    expect(within(host.container).getByText('Spring sale')).not.toBeVisible()
    expect(within(host.container).getByText('Snake plant')).toBeVisible()
    expect(screen.getByText('Free shipping over $50')).toBeVisible()
    expect(screen.getByText('Results for ferns')).toBeVisible()
    await expect.element(reviews).toBeInViewport()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Edited the page')).toBeVisible()
    expect(within(reply).getByText('9 actions')).toBeVisible()
    expect(within(reply).getByText('Clicked')).toBeVisible()
    expect(await within(reply).findAllByText('Buy the fern')).toHaveLength(2)
    expect(within(reply).getByText('Styled an element')).toBeVisible()
    expect(within(reply).getByText('Hovered')).toBeVisible()
    expect(within(reply).getByText('Pressed')).toBeVisible()
    expect(within(reply).getByText('Scrolled')).toBeVisible()
    expect(within(reply).getByText('Added a class')).toBeVisible()
    expect(within(reply).getByText('Set the text')).toBeVisible()
    expect(within(reply).getByText('Injected CSS')).toBeVisible()
    await expect
      .element(
        page.getByRole('article', {name: 'Reply to: Explain this page'}).getByText('Buy the fern', {exact: true}),
      )
      .toHaveLength(2)
    expect(within(reply).getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    expect(pageRpc.played().find((played) => played.action.type === 'screenshot')?.outcome).toMatchObject({
      type: 'success',
      result: {files: [expect.objectContaining({mime: 'image/webp'})]},
    })
    await page.viewport(375, 800)
    expect([window.innerWidth, window.innerHeight]).toEqual([375, 800])
  })
})

describe('the user stops the agent from the page', () => {
  test('two clicks on the page while the agent works stop the reply, in a test that starts at the configured 1280x800 again after one that shrank the viewport', async () => {
    expect([window.innerWidth, window.innerHeight]).toEqual([1280, 800])
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    const click = engine.gate()
    engine.reply(pageRpc.toolCall('c1', 'page_click', {selector: '#buy'}))
    const answer = engine.gate()
    engine.reply(FakeLLM.text('Never shown'))
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await click.started
    click.release()
    await answer.started
    const mask = await screen.findByRole('status', {name: 'Agent is using this page'})
    await user.click(mask)
    await user.click(mask)

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    answer.release()
    engine.reply(FakeLLM.text('Back at it'))
    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Go on')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Back at it')).toBeVisible()
    expect(screen.queryByText('Never shown')).not.toBeInTheDocument()
  })
})

describe('the agent leaves the page alone for a while', () => {
  test("with a short page task timeout the agent's mask goes away on its own while the reply still waits", async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage({taskTimeoutMs: 50})
    const click = engine.gate()
    engine.reply(pageRpc.toolCall('c1', 'page_click', {selector: '#buy'}))
    const answer = engine.gate()
    engine.reply(FakeLLM.text('The fern is in the cart'))
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await click.started
    const masked = screen.findByRole('status', {name: 'Agent is using this page'})
    click.release()
    const mask = await masked
    await answer.started

    await expect.element(mask).not.toBeInTheDocument()
    answer.release()
    const reply = await screen.findByRole('article', {name: /^Reply to:/})
    expect(await within(reply).findByText('The fern is in the cart')).toBeVisible()
  })
})

describe('the agent fills in a form on the page', () => {
  test('the agent reads the controls, types, picks, ticks, fills a whole form and a note, and submits by selector and by ref, and the page captures it keeps hold no card number, password or tracker url', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    engine.reply(
      pageRpc.toolCall('c1', 'page_snapshot', {selector: '#signup'}),
      pageRpc.toolCall('c2', 'page_fill', {ref: 'v1', value: 'ada@example.com'}),
      pageRpc.toolCall('c3', 'page_click', {ref: 'v2'}),
      pageRpc.toolCall('c4', 'page_fill', {selector: '#name', value: 'Ada'}),
      pageRpc.toolCall('c5', 'page_select', {selector: '#size', value: 'Large'}),
      pageRpc.toolCall('c6', 'page_check', {selector: '#gift'}),
      pageRpc.toolCall('c7', 'page_uncheck', {selector: '#news'}),
      pageRpc.toolCall('c8', 'page_submit', {selector: '#name'}),
      pageRpc.toolCall('c9', 'page_fill_form', {
        fields: [
          {type: 'text', selector: '#street', value: '12 Fern Lane'},
          {type: 'select', selector: '#day', value: 'Tuesday'},
          {type: 'check', selector: '#door', checked: true},
        ],
      }),
      pageRpc.toolCall('c10', 'page_fill', {selector: '#note', value: 'Happy birthday'}),
      pageRpc.toolCall('c11', 'page_fill', {selector: '#card', value: '4242 4242 4242 4242'}),
      pageRpc.toolCall('c12', 'page_fill', {selector: '#password', value: 'hunter2'}),
      FakeLLM.text('The order is placed'),
    )
    render(() => (
      <main>
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
          <input
            id="card"
            aria-label="Card number"
            autocomplete="cc-number"
            style={{'background-image': 'url(https://tracker.example.com/card.gif)'}}
          />
          <input id="password" type="password" aria-label="Password" />
        </form>
      </main>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('The order is placed')).toBeVisible()
    expect(screen.getByText('Thanks for joining, ada@example.com')).toBeVisible()
    expect(screen.getByRole('textbox', {name: 'Your name'})).toHaveValue('Ada')
    expect(screen.getByRole('combobox', {name: 'Pot size'})).toHaveValue('large')
    expect(screen.getByRole('checkbox', {name: 'Gift wrap'})).toBeChecked()
    expect(screen.getByRole('checkbox', {name: 'Send me news'})).not.toBeChecked()
    expect(screen.getByText('Order placed for Ada, large pot, gift wrapped, no news')).toBeVisible()
    expect(screen.getByRole('textbox', {name: 'Street'})).toHaveValue('12 Fern Lane')
    expect(screen.getByRole('combobox', {name: 'Delivery day'})).toHaveValue('tuesday')
    expect(screen.getByRole('checkbox', {name: 'Leave at the door'})).toBeChecked()
    expect(screen.getByRole('textbox', {name: 'Gift note'})).toHaveTextContent('Happy birthday')
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Captured a snapshot')).toBeVisible()
    expect(within(reply).getByText('11 actions')).toBeVisible()
    expect(within(reply).getAllByText('Typed')).toHaveLength(5)
    expect(within(reply).getByText('Clicked')).toBeVisible()
    expect(within(reply).getByText('Selected')).toBeVisible()
    expect(within(reply).getByText('Checked a box')).toBeVisible()
    expect(within(reply).getByText('Unchecked a box')).toBeVisible()
    expect(within(reply).getByText('Submitted the form')).toBeVisible()
    expect(within(reply).getByText('Filled the form')).toBeVisible()
    const captures = JSON.stringify(pageRpc.played().map((played) => played.outcome))
    expect(captures).toContain('Card number')
    expect(captures).toContain('Password')
    expect(captures).not.toContain('4242 4242 4242 4242')
    expect(captures).not.toContain('hunter2')
    expect(captures).not.toContain('tracker.example.com')
  })
})

describe('the agent plays a list of actions on the page', () => {
  test('a played list answers each action in the reply, and a queued list answers at once and the page plays it after', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc, sessionId} = await openPage()
    const playedLater = Promise.withResolvers<unknown>()
    engine.reply(
      FakeLLM.toolCall(
        'c1',
        'page_queue',
        {
          actions: [
            {tool: 'page_fill', selector: '#name', value: 'Ada'},
            {tool: 'page_click', selector: '#save'},
          ],
        },
        () =>
          pageRpc
            .queue([
              {type: 'fill', selector: '#name', value: 'Ada'},
              {type: 'click', selector: '#save'},
            ])
            .then((outcomes) => ({queueId: 'q1', status: 'finished', outcomes, failed: 0, played: 2})),
      ),
      FakeLLM.toolCall(
        'c2',
        'page_queue_async',
        {
          actions: [
            {tool: 'page_fill', selector: '#name', value: 'Grace'},
            {tool: 'page_click', selector: '#save'},
          ],
        },
        () => {
          playedLater.resolve(
            pageRpc.queue([
              {type: 'fill', selector: '#name', value: 'Grace'},
              {type: 'click', selector: '#save'},
            ]),
          )
          return {queueId: 'q2', actions: 2}
        },
      ),
      FakeLLM.text('Saving your names'),
      FakeLLM.text('Grace is saved too'),
    )
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const saved = document.createElement('p')
          saved.textContent = `Saved ${String(new FormData(event.currentTarget).get('name'))}`
          event.currentTarget.append(saved)
        }}
      >
        <input id="name" name="name" aria-label="Your name" />
        <button id="save" type="submit">
          Save
        </button>
      </form>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('Saving your names')).toBeVisible()
    expect(screen.getByText('Saved Ada')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Played page actions')).toBeVisible()
    expect(await playedLater.promise).toMatchObject([{type: 'success'}, {type: 'success'}, {type: 'success'}])
    expect(screen.getByText('Saved Grace')).toBeVisible()
    engine.synthetic(sessionId, {
      text: 'queue q2 finished: 2 played, 0 failed',
      description: 'Queued page actions finished',
    })
    await expect.element(page.getByText('Queued page actions finished', {exact: true})).toBeVisible()
    await expect.element(page.getByText('Grace is saved too', {exact: true})).toBeVisible()
    expect(within(reply).getAllByText('Queued page actions', {exact: true})).toHaveLength(1)
  })
})

describe('the element inspector', () => {
  test('the user holds Alt to inspect the page and Esc leaves it', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    await openPage()
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
    const {engine, pageRpc} = await openPage()
    engine.reply(
      pageRpc.toolCall('c1', 'page_effect', {action: 'enable', effect: 'highlight'}),
      FakeLLM.text('The highlight is on'),
    )

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('The highlight is on')).toBeVisible()
    await expect.element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true})).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Drove an effect')).toBeVisible()
  })
})

describe('the page follows the session the user switches to', () => {
  test('after a switch the page answers the session the user picked and leaves the old one', async () => {
    const user = userEvent.setup()
    const {pageRpc} = await openPage({
      sessions: [
        {id: 'ses_bravo', title: 'Bravo'},
        {id: 'ses_alpha', title: 'Alpha'},
      ],
    })
    await pageRpc.attached('ses_bravo')
    expect(await pageRpc.value({type: 'route'}, 'ses_bravo')).toMatchObject({pathname: '/'})

    await user.click(await screen.findByRole('button', {name: 'Bravo, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Bravo'}))
    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))
    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    await pageRpc.attached('ses_alpha')

    expect(await pageRpc.value({type: 'route'}, 'ses_alpha')).toMatchObject({pathname: '/'})
    expect(pageRpc.sessions()).toEqual([
      {sessionId: 'ses_bravo', ended: true},
      {sessionId: 'ses_alpha', ended: false},
    ])
  })
})

describe('the user grabs an element for the agent', () => {
  test('the picked element is a note drawn with its picture in the composer, which takes focus, the agent gets its sentence and its picture with the message, and one sent alone reads as a note', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    engine.reply(FakeLLM.text('That button buys the fern'), FakeLLM.text('That is the same button'))
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Select an element from the page'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(await within(notes).findByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await expect.element(screen.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveFocus()
    await user.keyboard('What does this do?')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('That button buys the fern')).toBeVisible()
    const sent = screen.getByRole('list', {name: 'Notes on this message'})
    expect(await within(sent).findByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    const [message] = engine.sent()
    expect(JSON.stringify(message?.messages.at(-1))).toMatch(
      /What does this do\?\\n+The user referenced the grabbed element \[<button id=\\"buy\\" type=\\"button\\">Buy the fern<\/button>/,
    )
    expect(message?.messages.at(-1)?.metadata).toMatchObject({
      comments: [{origin: 'page', href: expect.stringMatching(/^page-grab:grab_/)}],
    })
    expect(pageRpc.grabs()).toMatchObject([{preview: {kind: 'image', dataUrl: expect.stringMatching(/^data:image\//)}}])

    await user.click(screen.getByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Select an element from the page'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const staged = await screen.findByRole('list', {name: 'Notes'})
    expect(await within(staged).findByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('That is the same button')).toBeVisible()
    expect(screen.getByRole('article', {name: 'You: 1 note'})).toBeVisible()
  })
})

describe('a composer note from a page comment', () => {
  test('the user picks an element of the page to comment on, the note lands in the composer, and the agent gets the comment on that element', async () => {
    const user = userEvent.setup({delay: null})
    const {engine} = await openPage({plugins: [{id: 'page-comment', plugin: pageComment}]})
    engine.reply(FakeLLM.text('It is green now'))
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(await screen.findByRole('button', {name: 'Comment on the page'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(within(notes).getByText('Make this button green')).toBeVisible()
    expect(within(notes).getByText('Page comment')).toBeVisible()
    await expect.element(input).toHaveFocus()

    await user.keyboard('Do it')
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Do it'})
    expect(await within(reply).findByText('It is green now')).toBeVisible()
    expect(
      within(screen.getByRole('list', {name: 'Notes on this message'})).getByText('Make this button green'),
    ).toBeVisible()
    const sent = JSON.stringify(engine.sent()[0]?.messages.at(-1))
    expect(sent).toContain('The user made the following comment regarding')
    expect(sent).toContain('Buy the fern')
    expect(sent).toContain('Make this button green')
  })
})

describe('the agent reads a page with shadow roots of its own', () => {
  test('the agent reads into the host shadow root and never into the widget overlay', async () => {
    const {pageRpc} = await openPage()
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
    expect(await pageRpc.value({type: 'effect', action: 'enable', effect: 'highlight'})).toMatchObject({
      enabled: true,
    })
    await expect.element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true})).toBeVisible()

    expect(await pageRpc.value({type: 'text', selector: '#inside'})).toEqual({text: 'Water once a week'})
    expect(await pageRpc.value({type: 'exists', selector: 'kbd'})).toEqual({exists: false, count: 0})
  })
})

describe('the agent reads the address of a tab with secrets in it', () => {
  test('the tab the page reports and the route both name its address, hiding the token in the query and in the hash', async () => {
    const address = new URL(location.href)
    history.replaceState(null, '', `${address.pathname}?plant=fern&token=abc123#jwt=xyz789`)
    const {pageRpc} = await openPage()
    const redacted = `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`

    await expect.poll(() => pageRpc.tabs().at(-1)).toMatchObject({url: redacted, focused: true, visible: true})
    expect(await pageRpc.value({type: 'route'})).toEqual({
      pathname: address.pathname,
      search: '?plant=fern&token=%5Bredacted%5D',
      href: redacted,
      title: document.title,
      state: 'visible',
    })
  })
})

describe('a plugin adds its own page operation', () => {
  test('the operation reads the page, and a name no plugin registered is refused', async () => {
    const {pageRpc} = await openPage({plugins: [{id: 'basket-reader', plugin: basketReader}]})
    expect(await screen.findByText('Basket reader ready')).toBeVisible()
    render(() => (
      <ul id="basket">
        <li>Boston fern</li>
        <li>Snake plant</li>
      </ul>
    ))

    expect(await pageRpc.value({type: 'operation', name: 'basket.read', input: {}})).toEqual({
      plants: ['Boston fern', 'Snake plant'],
    })
    expect(await pageRpc.call({type: 'operation', name: 'basket.empty', input: {}})).toMatchObject({
      type: 'failure',
      message: expect.stringContaining('This page does not support the requested page operation'),
    })
  })
})

describe('the agent reads a page with an element named after a built-in', () => {
  test('the snapshot lists only the real controls', async () => {
    const {pageRpc} = await openPage()
    render(() => (
      <section id="sale">
        <Dynamic component="constructor">Spring sale</Dynamic>
        <button type="button">Buy</button>
      </section>
    ))

    expect(screen.getByRole('button', {name: 'Buy'})).toBeVisible()
    expect(await pageRpc.value({type: 'snapshot', selector: '#sale'})).toMatchObject({
      nodes: [{role: 'button', name: 'Buy'}],
    })
  })
})

describe('the agent reads host content', () => {
  test('exists, query, text and markup answer for the host section, and a selector that also matches the widget picks the host element only', async () => {
    const {pageRpc} = await openPage()
    render(() => (
      <section id="plants">
        <h2>Ferns</h2>
        <button type="button" id="buy">
          Buy the fern
        </button>
      </section>
    ))

    expect(screen.getByRole('heading', {name: 'Ferns'})).toBeVisible()
    expect(await pageRpc.value({type: 'exists', selector: '#plants button'})).toEqual({exists: true, count: 1})
    expect(await pageRpc.value({type: 'query', selector: '#plants button'})).toMatchObject({
      count: 1,
      elements: [{tagName: 'button', id: 'buy'}],
    })
    expect(await pageRpc.value({type: 'text', selector: '#plants'})).toEqual({text: 'FernsBuy the fern'})
    expect(await pageRpc.value({type: 'dom', selector: '#plants'})).toEqual({
      html: '<section id="plants"><h2>Ferns</h2><button type="button" id="buy">Buy the fern</button></section>',
    })
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(await pageRpc.value({type: 'text', selector: 'button'})).toEqual({text: 'Buy the fern'})
  })
})

describe('the agent runs code on the page', () => {
  test('the eval does not run when the user denies it', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage({tools: {page_eval: {ask: {title: 'page_eval'}}}})
    engine.reply(
      pageRpc.toolCall('c1', 'page_eval', {code: "document.querySelector('#price').textContent = 'free'"}),
      FakeLLM.text('I left the price alone'),
    )
    render(() => <p id="price">12 euros</p>)

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(within(ask).getByRole('button', {name: 'Deny'}))

    expect(await screen.findByText('I left the price alone')).toBeVisible()
    expect(screen.getByText('12 euros')).toBeVisible()
    expect(pageRpc.played()).toEqual([])
  })
})

describe('the agent reads the page during a reply', () => {
  test('the thread shows a card for the read and one for the read that failed', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    engine.reply(
      pageRpc.toolCall('c1', 'page_text', {selector: '#plants'}),
      pageRpc.toolCall('c2', 'page_text', {selector: '#sold-out'}, 'fails'),
      FakeLLM.text('The fern is in stock'),
    )
    render(() => (
      <section id="plants">
        <h2>Ferns</h2>
      </section>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

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
  test('with a page open the page answers what the agent asks for in the reply', async () => {
    const user = userEvent.setup()
    const {engine, pageRpc} = await openPage()
    engine.reply(pageRpc.toolCall('c1', 'page_route', {}), FakeLLM.text('This is the plant shop'))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('This is the plant shop')).toBeVisible()
    expect(pageRpc.played()).toMatchObject([{action: {type: 'route'}, outcome: {type: 'success'}}])
  })

  test('the agent reads a plain attribute while a password and a one-time code stay masked in every read', async () => {
    const {pageRpc} = await openPage()
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

    expect(await pageRpc.value({type: 'attr', selector: '#city', attribute: 'placeholder'})).toEqual({
      value: 'Lisbon',
    })
    expect(await pageRpc.value({type: 'value', selector: '#password'})).toEqual({value: '***'})
    expect(await pageRpc.value({type: 'value', selector: '#code'})).toEqual({value: '***'})
    expect(await pageRpc.value({type: 'attr', selector: '#password', attribute: 'value'})).toEqual({value: '***'})
    const markup = await pageRpc.value({type: 'dom', selector: '#login'})
    expect(markup).not.toMatchObject({html: expect.stringContaining('hunter2')})
    expect(markup).not.toMatchObject({html: expect.stringContaining('123456')})
    expect(await pageRpc.value({type: 'snapshot', selector: '#login'})).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({role: 'textbox', name: 'Password', value: '***'}),
        expect.objectContaining({role: 'textbox', name: 'Code', value: '***'}),
      ]),
    })
  })

  test('the agent reads what the page logged and waits for a toast the user brings up', async () => {
    const user = userEvent.setup()
    const {pageRpc} = await openPage()
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

    const waited = pageRpc.value({type: 'wait', selector: '#toast', state: 'visible'})
    await user.click(screen.getByRole('button', {name: 'Add the fern'}))

    expect(screen.getByText('Added to your cart')).toBeVisible()
    expect(await waited).toEqual({ok: true, state: 'visible'})
    expect(await pageRpc.value({type: 'console'})).toMatchObject({
      entries: expect.arrayContaining([expect.objectContaining({level: 'info', text: 'Fern added to cart'})]),
    })
  })
})

describe('the agent drives a page effect', () => {
  test('the highlight effect is listed off, turns on, reports itself on, and turns off again', async () => {
    const {pageRpc} = await openPage()

    expect(await pageRpc.value({type: 'effect', action: 'list'})).toEqual({
      effects: [
        {
          name: 'highlight',
          description: 'outline the element under the pointer and open its source on click',
          enabled: false,
        },
      ],
    })
    expect(await pageRpc.value({type: 'effect', action: 'enable', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: true,
    })
    expect(await pageRpc.value({type: 'effect', action: 'report', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: true,
    })
    expect(await pageRpc.value({type: 'effect', action: 'disable', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: false,
    })
    expect(await pageRpc.value({type: 'effect', action: 'report', effect: 'highlight'})).toEqual({
      effect: 'highlight',
      enabled: false,
    })
  })
})
