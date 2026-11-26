import {describe, expect} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Dynamic} from 'solid-js/web'
import {test, TestLLM, type EngineFixtures} from '@conciv/backend-test-utils'
import type {TestPlugin} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import {pageTestPlugin} from '../../src/test-utils.js'
import basketReader from '../fixtures/plugins/basket-reader.js'
import pageComment from '../fixtures/plugins/page-comment.js'

describe('the page plugin in the widget', () => {
  type OpenPage = {
    readonly config?: Parameters<EngineFixtures['createEngine']>[0]
    readonly page?: TestPlugin
    readonly plugins?: readonly TestPlugin[]
  }

  type Session = Awaited<ReturnType<EngineFixtures['createEngine']>>['session']

  async function pageServes(session: Session) {
    await expect
      .poll(() =>
        session
          .tool('page_tabs_list')
          .call({})
          .then(
            () => true,
            () => false,
          ),
      )
      .toBe(true)
  }

  async function openPage(createEngine: EngineFixtures['createEngine'], options: OpenPage = {}) {
    const engine = await createEngine(options.config, {plugins: ['@conciv/plugin-page']})
    await renderTestApp({engine, plugins: [options.page ?? pageTestPlugin, ...(options.plugins ?? [])]})
    await pageServes(engine.session)
    return engine
  }

  function pageCall(id: string, tool: string, input: object) {
    return TestLLM.toolCall(id, 'execute_typescript', {
      typescriptCode: `return await external_page_${tool}(${JSON.stringify(input)})`,
    })
  }

  async function toolAnswer(engine: Awaited<ReturnType<typeof openPage>>, toolCallId: string) {
    const requests = await engine.requests()
    return requests.flatMap((request) => request.messages).find((message) => message.toolCallId === toolCallId)
  }

  describe('the agent acts on the page during a reply', () => {
    test('the agent clicks, restyles, hovers, presses, scrolls and edits the page in one card, and the screenshot reaches the agent as an image', async ({
      createEngine,
    }) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(
        pageCall('c1', 'click', {selector: '#buy'}),
        pageCall('c2', 'setstyle', {selector: '#buy', prop: 'color', value: 'red'}),
        pageCall('c3', 'hover', {selector: '#shipping'}),
        pageCall('c4', 'fill', {selector: '#search', value: 'ferns'}),
        pageCall('c5', 'press', {selector: '#search', key: 'Enter'}),
        pageCall('c6', 'scroll', {selector: '#reviews'}),
        pageCall('c7', 'addclass', {selector: '#fern', class: 'sold-out'}),
        pageCall('c8', 'settext', {selector: '#title', text: 'Fern shop'}),
        pageCall('c9', 'css', {text: '#promo { display: none }'}),
        pageCall('c10', 'screenshot', {}),
        TestLLM.text('The shop is updated'),
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

      const finished = await engine.event('session.execution.succeeded')
      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

      await finished.arrived
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
      expect(JSON.parse(String((await toolAnswer(engine, 'c10'))?.content))).toMatchObject({
        files: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            source: expect.objectContaining({type: 'data', mimeType: 'image/webp'}),
          }),
        ]),
      })
      await page.viewport(375, 800)
      expect([window.innerWidth, window.innerHeight]).toEqual([375, 800])
    })
  })

  describe('the user stops the agent from the page', () => {
    test('two clicks on the page while the agent works stop the reply, in a test that starts at the configured 1280x800 again after one that shrank the viewport', async ({
      createEngine,
    }) => {
      expect([window.innerWidth, window.innerHeight]).toEqual([1280, 800])
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      const click = await engine.gate()
      await engine.reply(pageCall('c1', 'click', {selector: '#buy'}), TestLLM.text('Never shown'))
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
    test("with a short page task timeout the agent's mask goes away on its own while the reply still waits", async ({
      createEngine,
    }) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine, {page: {...pageTestPlugin, options: {taskTimeoutMs: 50}}})
      const click = await engine.gate()
      await engine.reply(pageCall('c1', 'click', {selector: '#buy'}), TestLLM.text('The fern is in the cart'))
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
      const reply = await screen.findByRole('article', {name: /^Reply to:/})
      expect(await within(reply).findByText('The fern is in the cart')).toBeVisible()
    })
  })

  describe('the agent fills in a form on the page', () => {
    test('the agent reads the controls, types, picks, ticks, fills a whole form and a note, and submits by selector and by ref, and the page captures it keeps hold no card number, password or tracker url', async ({
      createEngine,
    }) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(
        pageCall('c1', 'snapshot', {selector: '#signup'}),
        pageCall('c2', 'fill', {ref: 'v1', value: 'ada@example.com'}),
        pageCall('c3', 'click', {ref: 'v2'}),
        pageCall('c4', 'fill', {selector: '#name', value: 'Ada'}),
        pageCall('c5', 'select', {selector: '#size', value: 'Large'}),
        pageCall('c6', 'check', {selector: '#gift'}),
        pageCall('c7', 'uncheck', {selector: '#news'}),
        pageCall('c8', 'submit', {selector: '#name'}),
        pageCall('c9', 'fill_form', {
          fields: [
            {type: 'text', selector: '#street', value: '12 Fern Lane'},
            {type: 'select', selector: '#day', value: 'Tuesday'},
            {type: 'check', selector: '#door', checked: true},
          ],
        }),
        pageCall('c10', 'fill', {selector: '#note', value: 'Happy birthday'}),
        pageCall('c11', 'fill', {selector: '#card', value: '4242 4242 4242 4242'}),
        pageCall('c12', 'fill', {selector: '#password', value: 'hunter2'}),
        TestLLM.text('The order is placed'),
      )
      render(() => (
        <main>
          <form
            id="signup"
            onSubmit={(event) => {
              event.preventDefault()
              event.currentTarget.append(
                `Thanks for joining, ${String(new FormData(event.currentTarget).get('email'))}`,
              )
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

      const finished = await engine.event('session.execution.succeeded')
      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

      await finished.arrived
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
      const captures = JSON.stringify(
        await engine.rpc.call('experimental.page', 'captures.list', {sessionId: engine.session.id}),
      )
      expect(captures).toContain('Card number')
      expect(captures).toContain('Password')
      expect(captures).not.toContain('4242 4242 4242 4242')
      expect(captures).not.toContain('hunter2')
      expect(captures).not.toContain('tracker.example.com')
    })
  })

  describe('the agent plays a list of actions on the page', () => {
    test('a played list answers each action in the reply, and a queued list answers at once and the page plays it after', async ({
      createEngine,
    }) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(
        pageCall('c1', 'queue', {
          actions: [
            {tool: 'page_fill', selector: '#name', value: 'Ada'},
            {tool: 'page_click', selector: '#save'},
          ],
        }),
        pageCall('c2', 'queue_async', {
          actions: [
            {tool: 'page_fill', selector: '#name', value: 'Grace'},
            {tool: 'page_click', selector: '#save'},
          ],
        }),
        TestLLM.text('Saving your names'),
        TestLLM.text('Grace is saved too'),
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

      const finished = await engine.event('session.execution.succeeded')
      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

      await finished.arrived
      expect(await screen.findByText('Saving your names')).toBeVisible()
      expect(screen.getByText('Saved Ada')).toBeVisible()
      const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
      expect(within(reply).getByText('Played page actions')).toBeVisible()
      expect(await screen.findByText('Saved Grace')).toBeVisible()
      await expect.element(page.getByText('Queued page actions finished', {exact: true})).toBeVisible()
      await expect.element(page.getByText('Grace is saved too', {exact: true})).toBeVisible()
      expect(within(reply).getAllByText('Queued page actions', {exact: true})).toHaveLength(1)
      expect(JSON.stringify((await engine.requests()).at(-1)?.messages)).toContain('finished: 2 played, 0 failed')
    })
  })

  describe('the element inspector', () => {
    test('the user holds Alt to inspect the page and Esc leaves it', async ({createEngine}) => {
      await page.viewport(1280, 800)
      const user = userEvent.setup()
      await openPage(createEngine)
      render(() => (
        <button type="button" id="buy">
          Buy the fern
        </button>
      ))
      const buy = screen.getByRole('button', {name: 'Buy the fern'})
      await user.click(buy)
      expect(buy).toHaveFocus()

      await user.keyboard('{Alt>}')
      await expect
        .element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}))
        .toBeVisible()
      await user.keyboard('{Escape}')

      await expect
        .element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}))
        .not.toBeInTheDocument()
      await user.keyboard('{/Alt}')
      expect(buy).toHaveFocus()
      expect(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}).query()).toBeNull()
    })

    test('the agent turns the highlight effect on and the inspector opens on the page', async ({createEngine}) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(
        pageCall('c1', 'effect', {action: 'enable', effect: 'highlight'}),
        TestLLM.text('The highlight is on'),
      )

      const finished = await engine.event('session.execution.succeeded')
      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

      await finished.arrived
      expect(await screen.findByText('The highlight is on')).toBeVisible()
      await expect
        .element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}))
        .toBeVisible()
      const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
      expect(within(reply).getByText('Drove an effect')).toBeVisible()
    })
  })

  describe('the page follows the session the user switches to', () => {
    test('after a switch the page answers the session the user picked and leaves the old one', async ({
      createEngine,
    }) => {
      const user = userEvent.setup()
      const engine = await createEngine({}, {plugins: ['@conciv/plugin-page']})
      const alpha = await engine.newSession('Alpha')
      const bravo = await engine.newSession('Bravo')
      await renderTestApp({engine, plugins: [pageTestPlugin], initialEntries: [`/panel/${bravo.id}?open=true`]})
      await pageServes(bravo)
      expect(await bravo.tool('page_route').call({})).toMatchObject({pathname: '/'})

      await user.click(await screen.findByRole('button', {name: 'Bravo, session options'}))
      await user.click(await screen.findByRole('button', {name: 'Session: Bravo'}))
      await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))
      expect(await screen.findByText('Switched to Alpha')).toBeVisible()
      await pageServes(alpha)

      expect(await alpha.tool('page_route').call({})).toMatchObject({pathname: '/'})
      await expect
        .poll(() =>
          bravo
            .tool('page_route')
            .failure({})
            .then((failure) => failure.message),
        )
        .toContain("'external_page_route' is not defined")
    })
  })

  describe('the user grabs an element for the agent', () => {
    test('the picked element is a note drawn with its picture in the composer, which takes focus, the agent gets its sentence and its picture with the message, and one sent alone reads as a note', async ({
      createEngine,
    }) => {
      await page.viewport(1280, 800)
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(TestLLM.text('That button buys the fern'), TestLLM.text('That is the same button'))
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
      expect((await engine.requests()).at(-1)?.messages.at(-1)).toMatchObject({
        role: 'user',
        content: [
          {
            type: 'text',
            content: expect.stringMatching(
              /^What does this do\?\n+The user referenced the grabbed element \[<button id="buy" type="button">Buy the fern<\/button>/,
            ),
          },
          {type: 'image', source: {type: 'data', mimeType: 'image/webp', value: expect.any(String)}},
        ],
      })

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
    test('the user picks an element of the page to comment on, the note lands in the composer, and the agent gets the comment on that element', async ({
      createEngine,
    }) => {
      const user = userEvent.setup({delay: null})
      const engine = await openPage(createEngine, {plugins: [{id: 'page-comment', plugin: pageComment}]})
      await engine.reply(TestLLM.text('It is green now'))
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
      const sent = JSON.stringify((await engine.requests())[0]?.messages.at(-1))
      expect(sent).toContain('The user made the following comment regarding')
      expect(sent).toContain('Buy the fern')
      expect(sent).toContain('Make this button green')
    })
  })

  describe('the agent reads a page with shadow roots of its own', () => {
    test('the agent reads into the host shadow root and never into the widget overlay', async ({createEngine}) => {
      const engine = await openPage(createEngine)
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
      await expect
        .element(page.getByText('Inspecting · click to open source · Esc to exit', {exact: true}))
        .toBeVisible()

      expect(await engine.session.tool('page_text').call({selector: '#inside'})).toEqual({text: 'Water once a week'})
      expect(await engine.session.tool('page_exists').call({selector: 'kbd'})).toEqual({exists: false, count: 0})
    })
  })

  describe('the agent reads the address of a tab with secrets in it', () => {
    test('the tab the page reports and the route both name its address, hiding the token in the query and in the hash', async ({
      createEngine,
    }) => {
      const address = new URL(location.href)
      history.replaceState(null, '', `${address.pathname}?plant=fern&token=abc123#jwt=xyz789`)
      const engine = await openPage(createEngine)
      const redacted = `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`

      await expect
        .poll(() => engine.session.tool('page_tabs_list').call({}))
        .toMatchObject({tabs: [{url: redacted, focused: true, visible: true}]})
      expect(await engine.session.tool('page_route').call({})).toEqual({
        pathname: address.pathname,
        search: '?plant=fern&token=%5Bredacted%5D',
        href: redacted,
        title: document.title,
        state: 'visible',
      })
    })
  })

  describe('a plugin adds its own page operation', () => {
    test('the operation reads the page, and a name no plugin registered is refused', async ({createEngine}) => {
      const engine = await openPage(createEngine, {plugins: [{id: 'basket-reader', plugin: basketReader}]})
      expect(await screen.findByText('Basket reader ready')).toBeVisible()
      render(() => (
        <ul id="basket">
          <li>Boston fern</li>
          <li>Snake plant</li>
        </ul>
      ))

      const basket = {sessionId: engine.session.id, input: {}, reading: true}
      expect(await engine.rpc.call('experimental.page', 'operate', {...basket, name: 'basket.read'})).toEqual({
        plants: ['Boston fern', 'Snake plant'],
      })
      expect(await engine.rpc.failure('experimental.page', 'operate', {...basket, name: 'basket.empty'})).toMatchObject(
        {
          message: expect.stringContaining('This page does not support the requested page operation'),
        },
      )
    })
  })

  describe('the agent reads a page with an element named after a built-in', () => {
    test('the snapshot lists only the real controls', async ({createEngine}) => {
      const engine = await openPage(createEngine)
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

  describe('the agent reads host content', () => {
    test('exists, query, text and markup answer for the host section, and a selector that also matches the widget picks the host element only', async ({
      createEngine,
    }) => {
      const engine = await openPage(createEngine)
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
      expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
      expect(await engine.session.tool('page_text').call({selector: 'button'})).toEqual({text: 'Buy the fern'})
    })
  })

  describe('the agent runs code on the page', () => {
    test('the eval does not run when the user denies it', async ({createEngine}) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine, {config: {permission: {page_eval: 'ask'}}})
      await engine.reply(
        pageCall('c1', 'eval', {code: "document.querySelector('#price').textContent = 'free'"}),
        TestLLM.text('I left the price alone'),
      )
      render(() => <p id="price">12 euros</p>)

      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
      const ask = await screen.findByRole('group', {name: 'Permission request'})
      await user.click(within(ask).getByRole('button', {name: 'Deny'}))

      expect(await screen.findByText('I left the price alone')).toBeVisible()
      expect(screen.getByText('12 euros')).toBeVisible()
      expect(await engine.session.tool('page_changes').call({})).toEqual({changes: []})
    })
  })

  describe('the agent reads the page during a reply', () => {
    test('the thread shows a card for the read and one for the read that failed', async ({createEngine}) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(
        pageCall('c1', 'text', {selector: '#plants'}),
        pageCall('c2', 'text', {selector: '#sold-out'}),
        TestLLM.text('The fern is in stock'),
      )
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
    test('with a page open the page answers what the agent asks for in the reply', async ({createEngine}) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
      await engine.reply(pageCall('c1', 'route', {}), TestLLM.text('This is the plant shop'))

      const finished = await engine.event('session.execution.succeeded')
      await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

      await finished.arrived
      expect(await screen.findByText('This is the plant shop')).toBeVisible()
      expect(await toolAnswer(engine, 'c1')).toMatchObject({role: 'tool', content: expect.stringContaining('pathname')})
    })

    test('the agent reads a plain attribute while a password and a one-time code stay masked in every read', async ({
      createEngine,
    }) => {
      const engine = await openPage(createEngine)
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

    test('the agent reads what the page logged and waits for a toast the user brings up', async ({createEngine}) => {
      const user = userEvent.setup()
      const engine = await openPage(createEngine)
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
  })

  describe('the agent drives a page effect', () => {
    test('the highlight effect is listed off, turns on, reports itself on, and turns off again', async ({
      createEngine,
    }) => {
      const engine = await openPage(createEngine)

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
})
