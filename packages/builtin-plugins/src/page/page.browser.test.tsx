import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {difference} from 'es-toolkit'
import {z} from 'zod'
import {mount, pluginEngine, type ShellTool, type TestEngine} from '@conciv/plugin-testkit/browser'
import type {PluginOptions} from '@conciv/plugin/experimental'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import pagePlugin from './renderer.js'

describe('the page plugin in the app shell', () => {
  const PAGE = '@conciv/plugin-page'

  const INSPECTING = 'Inspecting · click to open source · Esc to exit'

  type Step = {readonly name: string; readonly input: Record<string, unknown>}

  type Played = {readonly call: ToolCallPart; readonly result: ToolResultPart; readonly output: unknown}

  async function attachedPage(options: PluginOptions = {}) {
    const engine = await pluginEngine({plugins: [[PAGE, options]]})
    const control = await engine.event('rpc.experimental.page.control')
    const [tools, setTools] = createStore<ShellTool[]>([])
    await mount(pagePlugin, {id: PAGE, engine, options, tools})
    await control.arrived
    return {engine, show: (...cards: ShellTool[]) => setTools(cards)}
  }

  const FilePart = z.object({type: z.literal('file'), mime: z.string(), uri: z.string()})

  const ShotFile = z
    .array(z.unknown())
    .transform((parts) => parts.flatMap((part) => FilePart.safeParse(part).data ?? []))
    .pipe(z.tuple([FilePart]))
    .transform(([file]) => file)

  const CapturedCalls = z.object({captures: z.array(z.object({toolCallId: z.string()}))})

  async function capturedCalls(engine: TestEngine): Promise<string[]> {
    const listed = CapturedCalls.parse(
      await engine.call('experimental.page', 'captures.list', {sessionId: engine.sessionId}),
    )
    return listed.captures.map((capture) => capture.toolCallId)
  }

  async function playOne(engine: TestEngine, step: Step, fallbackId: string): Promise<Played> {
    const before = await capturedCalls(engine)
    const answer = await engine.tool(step.name).answer(step.input)
    const id = difference(await capturedCalls(engine), before)[0] ?? fallbackId
    return {
      call: {type: 'tool-call', id, name: step.name, arguments: JSON.stringify(step.input), state: 'input-complete'},
      result: {type: 'tool-result', toolCallId: id, content: JSON.stringify(answer.output), state: 'complete'},
      output: answer.output,
    }
  }

  function play(engine: TestEngine, steps: readonly Step[]): Promise<Played[]> {
    return steps.reduce<Promise<Played[]>>(
      async (done, step, index) => [...(await done), await playOne(engine, step, `c${index + 1}`)],
      Promise.resolve([]),
    )
  }

  function sessionCard(engine: TestEngine, played: readonly Played[]): ShellTool {
    return {
      tool: 'page_',
      input: {},
      metadata: {parts: played.map((step) => step.call), results: played.map((step) => step.result)},
      status: 'complete',
      sessionID: engine.sessionId,
    }
  }

  function toolCard(engine: TestEngine, name: string, input: Record<string, unknown>, output: unknown): ShellTool {
    return {
      tool: name,
      input,
      metadata: {},
      status: 'completed',
      output: JSON.stringify(output),
      defaultOpen: true,
      sessionID: engine.sessionId,
    }
  }

  function shell() {
    return within(screen.getByRole('main', {name: 'App shell'}))
  }

  describe('the agent acts on the page', () => {
    test('the agent clicks, restyles, hovers, types, presses, scrolls and edits the page, the actions fold into one card, the screenshot answers with an image, and the change list empties once read', async () => {
      const {engine, show} = await attachedPage()
      const host = render(() => (
        <section>
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
        </section>
      ))
      const reviews = page.getByRole('heading', {name: 'Reviews'})
      await expect.element(reviews).not.toBeInViewport()

      const played = await play(engine, [
        {name: 'page_click', input: {selector: '#buy'}},
        {name: 'page_setstyle', input: {selector: '#buy', prop: 'color', value: 'red'}},
        {name: 'page_hover', input: {selector: '#shipping'}},
        {name: 'page_fill', input: {selector: '#search', value: 'ferns'}},
        {name: 'page_press', input: {selector: '#search', key: 'Enter'}},
        {name: 'page_scroll', input: {selector: '#reviews'}},
        {name: 'page_addclass', input: {selector: '#fern', class: 'sold-out'}},
        {name: 'page_settext', input: {selector: '#title', text: 'Fern shop'}},
        {name: 'page_css', input: {text: '#promo { display: none }'}},
      ])

      expect(within(host.container).getByRole('heading', {name: 'Fern shop'})).toBeVisible()
      expect(within(host.container).getByText('Boston fern')).not.toBeVisible()
      expect(within(host.container).getByText('Spring sale')).not.toBeVisible()
      expect(within(host.container).getByText('Snake plant')).toBeVisible()
      expect(within(host.container).getByText('Free shipping over $50')).toBeVisible()
      expect(within(host.container).getByText('Results for ferns')).toBeVisible()
      await expect.element(reviews).toBeInViewport()

      const shot = await engine.tool('page_screenshot').answer({})
      const picture = ShotFile.parse(shot.content)
      expect(picture.uri).toMatch(/^data:image\/webp;base64,/)
      const image = {type: 'image', source: {type: 'data', mimeType: picture.mime, value: picture.uri.split(',')[1]}}

      show(sessionCard(engine, played), toolCard(engine, 'page_screenshot', {}, [image]))
      const card = await shell().findByRole('button', {name: /Edited the page/})
      expect(within(card).getByText('9 actions')).toBeVisible()
      expect(shell().getByText('Clicked')).toBeVisible()
      expect(await shell().findAllByText('Buy the fern', {exact: true})).toHaveLength(2)
      expect(shell().getByText('Styled an element')).toBeVisible()
      expect(shell().getByText('Hovered')).toBeVisible()
      expect(shell().getByText('Typed')).toBeVisible()
      expect(shell().getByText('Pressed')).toBeVisible()
      expect(shell().getByText('Scrolled')).toBeVisible()
      expect(shell().getByText('Added a class')).toBeVisible()
      expect(shell().getByText('Set the text')).toBeVisible()
      expect(shell().getByText('Injected CSS')).toBeVisible()
      expect(shell().getByRole('img', {name: 'Took a screenshot'})).toBeVisible()

      expect(await engine.tool('page_changes').call({clear: true})).toMatchObject({
        changes: expect.arrayContaining([
          expect.objectContaining({verb: 'page_click', selector: '#buy'}),
          expect.objectContaining({verb: 'page_settext', selector: '#title', args: {text: 'Fern shop'}}),
        ]),
      })
      expect(await engine.tool('page_changes').call({})).toEqual({changes: []})
    })
  })

  describe('the mask the agent puts over the page while it acts', () => {
    test('the mask covers the page while the agent clicks, one click on it asks to confirm, and a second click takes it away', async () => {
      const user = userEvent.setup()
      const {engine} = await attachedPage()
      render(() => (
        <button type="button" id="buy">
          Buy the fern
        </button>
      ))

      expect(await engine.tool('page_click').call({selector: '#buy'})).toMatchObject({ok: true})
      const mask = await screen.findByRole('status', {name: 'Agent is using this page'})
      await user.click(mask)
      expect(mask).toBeVisible()
      await user.click(mask)

      await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    })

    test('with a short page task timeout the mask goes away on its own after the agent stops acting', async () => {
      const {engine} = await attachedPage({taskTimeoutMs: 50})
      render(() => (
        <button type="button" id="buy">
          Buy the fern
        </button>
      ))

      expect(await engine.tool('page_click').call({selector: '#buy'})).toMatchObject({ok: true})
      expect(screen.getByRole('status', {name: 'Agent is using this page'})).toBeVisible()

      await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    })
  })

  describe('the agent fills in a form on the page', () => {
    test('the agent reads the controls, types, picks, ticks, fills a whole form and a note, and submits by selector and by ref, the card names every step, and the page captures it keeps hold no card number, password or tracker url', async () => {
      const {engine, show} = await attachedPage()
      render(() => (
        <section>
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
        </section>
      ))

      const [snapshot, ...acts] = await play(engine, [
        {name: 'page_snapshot', input: {selector: '#signup'}},
        {name: 'page_fill', input: {ref: 'v1', value: 'ada@example.com'}},
        {name: 'page_click', input: {ref: 'v2'}},
        {name: 'page_fill', input: {selector: '#name', value: 'Ada'}},
        {name: 'page_select', input: {selector: '#size', value: 'Large'}},
        {name: 'page_check', input: {selector: '#gift'}},
        {name: 'page_uncheck', input: {selector: '#news'}},
        {name: 'page_submit', input: {selector: '#name'}},
        {
          name: 'page_fill_form',
          input: {
            fields: [
              {type: 'text', selector: '#street', value: '12 Fern Lane'},
              {type: 'select', selector: '#day', value: 'Tuesday'},
              {type: 'check', selector: '#door', checked: true},
            ],
          },
        },
        {name: 'page_fill', input: {selector: '#note', value: 'Happy birthday'}},
        {name: 'page_fill', input: {selector: '#card', value: '4242 4242 4242 4242'}},
        {name: 'page_fill', input: {selector: '#password', value: 'hunter2'}},
      ])

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

      show(toolCard(engine, 'page_snapshot', {selector: '#signup'}, snapshot?.output), sessionCard(engine, acts))
      expect(await shell().findByText('Captured a snapshot')).toBeVisible()
      const card = shell().getByRole('button', {name: /Edited the page/})
      expect(within(card).getByText('11 actions')).toBeVisible()
      expect(shell().getAllByText('Typed')).toHaveLength(5)
      expect(shell().getByText('Clicked')).toBeVisible()
      expect(shell().getByText('Selected')).toBeVisible()
      expect(shell().getByText('Checked a box')).toBeVisible()
      expect(shell().getByText('Unchecked a box')).toBeVisible()
      expect(shell().getByText('Submitted the form')).toBeVisible()
      expect(shell().getByText('Filled the form')).toBeVisible()

      const captures = JSON.stringify(
        await engine.call('experimental.page', 'captures.list', {sessionId: engine.sessionId}),
      )
      expect(captures).toContain('Card number')
      expect(captures).toContain('Password')
      expect(captures).not.toContain('4242 4242 4242 4242')
      expect(captures).not.toContain('hunter2')
      expect(captures).not.toContain('tracker.example.com')
    })
  })

  describe('the agent plays a list of actions on the page', () => {
    test('a played list answers once the page played each action, and a queued list answers at once with its id and the page plays it after', async () => {
      const {engine, show} = await attachedPage()
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

      const queue = {
        actions: [
          {tool: 'page_fill', selector: '#name', value: 'Ada'},
          {tool: 'page_click', selector: '#save'},
        ],
      }
      const playedList = await engine.tool('page_queue').call(queue)
      expect(screen.getByText('Saved Ada')).toBeVisible()
      show(toolCard(engine, 'page_queue', queue, playedList))
      expect(await shell().findByText('Played page actions')).toBeVisible()

      const finished = await engine.event('rpc.experimental.page.queue.finished')
      const queued = await engine.tool('page_queue_async').call({
        actions: [
          {tool: 'page_fill', selector: '#name', value: 'Grace'},
          {tool: 'page_click', selector: '#save'},
        ],
      })
      expect(queued).toMatchObject({queueId: expect.stringMatching(/^q_/)})
      await finished.arrived
      expect(await screen.findByText('Saved Grace')).toBeVisible()
    })
  })

  describe('the element inspector', () => {
    test('the user holds Alt to inspect the page and Esc leaves it with focus where it was', async () => {
      await page.viewport(1280, 800)
      const user = userEvent.setup()
      await attachedPage()
      render(() => (
        <button type="button" id="buy">
          Buy the fern
        </button>
      ))
      const buy = screen.getByRole('button', {name: 'Buy the fern'})
      await user.click(buy)
      expect(buy).toHaveFocus()

      await user.keyboard('{Alt>}')
      await expect.element(page.getByText(INSPECTING, {exact: true})).toBeVisible()
      await user.keyboard('{Escape}')

      await expect.element(page.getByText(INSPECTING, {exact: true})).not.toBeInTheDocument()
      await user.keyboard('{/Alt}')
      expect(buy).toHaveFocus()
      expect(page.getByText(INSPECTING, {exact: true}).query()).toBeNull()
    })

    test('the highlight effect is listed off, the agent turns it on and the inspector opens, it reports itself on, its card says the agent drove it, and it turns off again', async () => {
      const {engine, show} = await attachedPage()

      expect(await engine.tool('page_effect').call({action: 'list'})).toEqual({
        effects: [
          {
            name: 'highlight',
            description: 'outline the element under the pointer and open its source on click',
            enabled: false,
          },
        ],
      })
      const enable = {action: 'enable', effect: 'highlight'}
      const enabled = await engine.tool('page_effect').call(enable)
      expect(enabled).toEqual({effect: 'highlight', enabled: true})
      await expect.element(page.getByText(INSPECTING, {exact: true})).toBeVisible()
      expect(await engine.tool('page_effect').call({action: 'report', effect: 'highlight'})).toEqual({
        effect: 'highlight',
        enabled: true,
      })
      show(toolCard(engine, 'page_effect', enable, enabled))
      expect(await shell().findByText('Drove an effect')).toBeVisible()

      expect(await engine.tool('page_effect').call({action: 'disable', effect: 'highlight'})).toEqual({
        effect: 'highlight',
        enabled: false,
      })
      expect(await engine.tool('page_effect').call({action: 'report', effect: 'highlight'})).toEqual({
        effect: 'highlight',
        enabled: false,
      })
    })
  })

  describe('the agent reads the page and never the conciv UI on it', () => {
    test('the agent reads into a host shadow root, and a selector that also matches a button of the app shell picks the host element only', async () => {
      const {engine, show} = await attachedPage()
      render(() => (
        <section>
          <section
            id="card"
            ref={(card) => {
              card
                .attachShadow({mode: 'open'})
                .append(Object.assign(document.createElement('p'), {id: 'inside', textContent: 'Water once a week'}))
            }}
          />
          <button type="button">Buy the fern</button>
        </section>
      ))
      const enable = {action: 'enable', effect: 'highlight'}
      const enabled = await engine.tool('page_effect').call(enable)
      expect(enabled).toMatchObject({enabled: true})
      await expect.element(page.getByText(INSPECTING, {exact: true})).toBeVisible()
      show(toolCard(engine, 'page_effect', enable, enabled))
      expect(await shell().findByRole('button', {name: /Drove an effect/})).toBeVisible()

      expect(await engine.tool('page_text').call({selector: '#inside'})).toEqual({text: 'Water once a week'})
      expect(await engine.tool('page_text').call({selector: 'button'})).toEqual({text: 'Buy the fern'})
    })
  })

  describe('the agent reads the address of a tab with secrets in it', () => {
    test('the route reads its address and the tab list names the focused tab, both hiding the token in the query and in the hash', async () => {
      const address = new URL(location.href)
      history.replaceState(null, '', `${address.pathname}?plant=fern&token=abc123#jwt=xyz789`)
      const {engine} = await attachedPage()

      expect(await engine.tool('page_route').call({})).toEqual({
        pathname: address.pathname,
        search: '?plant=fern&token=%5Bredacted%5D',
        href: `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`,
        title: document.title,
        state: 'visible',
      })
      expect(await engine.tool('page_tabs_list').call({})).toMatchObject({
        tabs: [
          {
            url: `${address.origin}${address.pathname}?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D`,
            focused: true,
            visible: true,
          },
        ],
      })
    })
  })

  describe('a page operation no plugin registered', () => {
    test('is refused with a hint to reload the page', async () => {
      const {engine} = await attachedPage()

      expect(
        await engine.failure('experimental.page', 'operate', {
          sessionId: engine.sessionId,
          name: 'basket.empty',
          input: {},
          reading: false,
        }),
      ).toMatchObject({message: expect.stringContaining('This page does not support the requested page operation')})
    })
  })

  describe('the agent reads host content', () => {
    test('exists, query, text and markup answer for the host section, and the snapshot of a section with an element named after a built-in lists only the real controls', async () => {
      const {engine} = await attachedPage()
      render(() => (
        <section>
          <section id="plants">
            <h2>Ferns</h2>
            <button type="button" id="buy">
              Buy the fern
            </button>
          </section>
          <section id="sale">
            <Dynamic component="constructor">Spring sale</Dynamic>
            <button type="button">Buy</button>
          </section>
        </section>
      ))

      expect(screen.getByRole('heading', {name: 'Ferns'})).toBeVisible()
      expect(await engine.tool('page_exists').call({selector: '#plants button'})).toEqual({exists: true, count: 1})
      expect(await engine.tool('page_query').call({selector: '#plants button'})).toMatchObject({
        count: 1,
        elements: [{tagName: 'button', id: 'buy'}],
      })
      expect(await engine.tool('page_text').call({selector: '#plants'})).toEqual({text: 'FernsBuy the fern'})
      expect(await engine.tool('page_dom').call({selector: '#plants'})).toEqual({
        html: '<section id="plants"><h2>Ferns</h2><button type="button" id="buy">Buy the fern</button></section>',
      })
      expect(screen.getByRole('button', {name: 'Buy'})).toBeVisible()
      expect(await engine.tool('page_snapshot').call({selector: '#sale'})).toMatchObject({
        nodes: [{role: 'button', name: 'Buy'}],
      })
    })

    test('the read card names what was read, and the read that failed shows why', async () => {
      const {engine, show} = await attachedPage()
      render(() => (
        <section id="plants">
          <h2>Ferns</h2>
        </section>
      ))

      const read = await engine.tool('page_text').call({selector: '#plants'})
      const failed = await engine.tool('page_text').failure({selector: '#sold-out'})
      expect(failed.message).toContain('[page.invalid-args] no element for selector #sold-out')
      show(toolCard(engine, 'page_text', {selector: '#plants'}, read), {
        tool: 'page_text',
        input: {selector: '#sold-out'},
        metadata: {},
        status: 'error',
        error: failed.message,
        sessionID: engine.sessionId,
      })

      const card = await shell().findByRole('button', {name: /Read the text/})
      expect(within(card).getByText('Read the text')).toBeVisible()
      expect(within(card).getByText('#plants')).toBeVisible()
      expect(within(card).getByRole('img', {name: 'succeeded'})).toBeVisible()
      const failure = shell().getByRole('button', {name: /Page text/})
      expect(within(failure).getByText('[page.invalid-args] no element for selector #sold-out')).toBeVisible()
    })

    test('the agent reads a plain attribute while a password and a one-time code stay masked in every read', async () => {
      const {engine} = await attachedPage()
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
      expect(await engine.tool('page_attr').call({selector: '#city', attribute: 'placeholder'})).toEqual({
        value: 'Lisbon',
      })
      expect(await engine.tool('page_value').call({selector: '#password'})).toEqual({value: '***'})
      expect(await engine.tool('page_value').call({selector: '#code'})).toEqual({value: '***'})
      expect(await engine.tool('page_attr').call({selector: '#password', attribute: 'value'})).toEqual({value: '***'})
      const markup = await engine.tool('page_dom').call({selector: '#login'})
      expect(markup).not.toMatchObject({html: expect.stringContaining('hunter2')})
      expect(markup).not.toMatchObject({html: expect.stringContaining('123456')})
      expect(await engine.tool('page_snapshot').call({selector: '#login'})).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({role: 'textbox', name: 'Password', value: '***'}),
          expect.objectContaining({role: 'textbox', name: 'Code', value: '***'}),
        ]),
      })
    })

    test('the agent reads what the page logged and waits for a toast the user brings up', async () => {
      const user = userEvent.setup()
      const {engine} = await attachedPage()
      render(() => (
        <section>
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
        </section>
      ))

      const waited = engine.tool('page_wait').call({selector: '#toast', state: 'visible'})
      await user.click(screen.getByRole('button', {name: 'Add the fern'}))

      expect(screen.getByText('Added to your cart')).toBeVisible()
      expect(await waited).toEqual({ok: true, state: 'visible'})
      expect(await engine.tool('page_console').call({})).toMatchObject({
        entries: expect.arrayContaining([expect.objectContaining({level: 'info', text: 'Fern added to cart'})]),
      })
    })
  })

  describe('the agent runs code on the page', () => {
    test('the eval does not run when a permission rule denies it', async () => {
      const engine = await pluginEngine({
        plugins: [PAGE],
        permissions: [{action: 'page_eval', resource: '*', effect: 'deny'}],
      })
      const control = await engine.event('rpc.experimental.page.control')
      await mount(pagePlugin, {id: PAGE, engine})
      await control.arrived
      render(() => <p id="price">12 euros</p>)

      expect(
        await engine.tool('page_eval').failure({code: "document.querySelector('#price').textContent = 'free'"}),
      ).toMatchObject({message: expect.stringMatching(/denied/)})
      expect(screen.getByText('12 euros')).toBeVisible()
    })
  })
})
