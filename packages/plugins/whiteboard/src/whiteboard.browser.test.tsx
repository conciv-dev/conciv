import {assert, describe, expect, onTestFinished, test} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {z} from 'zod'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent draws on the open canvas', () => {
  test('the agent drafts, previews, publishes, exports and discards a sketch with a card per step, and a destructive step asks first', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "await external_whiteboard_canvas_draw({elements: [{type: 'rectangle', id: 'cart', x: 0, y: 0, width: 120, height: 60}, {type: 'rectangle', id: 'pay', x: 240, y: 0, width: 120, height: 60}]}); await external_whiteboard_canvas_connect({fromId: 'cart', toId: 'pay'}); return await external_whiteboard_canvas_update({elementId: 'cart', patch: {backgroundColor: '#ffc9c9'}})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode:
          'await external_whiteboard_canvas_preview({}); return await external_whiteboard_canvas_commit({})',
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_canvas_export({format: 'png', scope: 'live'})",
      }),
      TestLLM.toolCall('c4', 'execute_typescript', {
        typescriptCode:
          'await external_whiteboard_canvas_svg({svg: \'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="0" y="0" width="100" height="50" fill="#a5d8ff" stroke="#1971c2" stroke-width="2"/></svg>\', x: 0, y: 200}); await external_whiteboard_canvas_diagram({mermaid: \'flowchart LR\\n  Cart --> Pay\'}); return await external_whiteboard_canvas_discard({})',
      }),
      TestLLM.text('The checkout sketch is on the canvas'),
      TestLLM.toolCall('c5', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_canvas_delete({elementId: 'pay'})",
      }),
      TestLLM.toolCall('c6', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_canvas_clear({})',
      }),
      TestLLM.text('I removed the pay step and kept the rest'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Sketch the checkout flow')
    expect(input).toHaveFocus()
    const sketchedTurn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await sketchedTurn.arrived

    expect(await screen.findByText('The checkout sketch is on the canvas')).toBeVisible()
    const sketch = screen.getByRole('article', {name: 'Reply to: Sketch the checkout flow'})
    expect(within(sketch).getByText('whiteboard_canvas_draw')).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_draw\s*2 elements to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_connect\s*cart → pay/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_update\s*updated cart/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_preview\s*3 elements/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_commit\s*3 published/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_svg\s*svg to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_diagram\s*mermaid to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_discard\s*\d+ discarded/})).toBeVisible()
    await user.click(within(sketch).getByRole('button', {name: /\bwhiteboard_canvas_export\b/}))
    expect(await within(sketch).findByRole('img', {name: 'canvas export'})).toBeVisible()
    const sketched = (await engine.requests()).at(-1)
    const committed = sketched?.messages.find((message) => message.toolCallId === 'c2')
    expect(JSON.parse(String(committed?.content))).toMatchObject({
      success: true,
      result: {committed: true, elements: 3},
    })
    const exported = sketched?.messages.find((message) => message.toolCallId === 'c3')
    expect(JSON.parse(String(exported?.content))).toMatchObject({
      success: true,
      result: {scope: 'live'},
      files: [{type: 'image', source: {type: 'data', mimeType: 'image/png'}}],
    })

    await user.type(input, 'Remove the pay step and clear the rest')
    expect(input).toHaveFocus()
    const tidiedTurn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Allow once'}))
    const tidy = await screen.findByRole('article', {name: 'Reply to: Remove the pay step and clear the rest'})
    expect(await within(tidy).findByText('pay')).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Deny'}))
    await tidiedTurn.arrived

    expect(await screen.findByText('I removed the pay step and kept the rest')).toBeVisible()
    expect(within(tidy).getByText('whiteboard_canvas_clear')).toBeVisible()
    const live = await engine.session.tool('whiteboard_canvas_read').call({scope: 'live'})
    expect(live).toHaveProperty('elements.length', 2)
    expect(live).toMatchObject({
      scope: 'live',
      elements: expect.arrayContaining([
        expect.objectContaining({id: 'cart', backgroundColor: '#ffc9c9'}),
        expect.objectContaining({type: 'arrow'}),
      ]),
    })
  })
})

describe("the user works the agent's comments on the canvas", () => {
  test('the user finds, sorts, marks read, answers, resolves and deletes threads, the agent reads the answer and lists what is left, and Escape closes one layer at a time', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const create = engine.session.tool('whiteboard_comment_create')
    await create.call({
      cid: 'price',
      kind: 'floating',
      parts: [{type: 'text', text: 'The price wraps on small screens'}],
      x: 120,
      y: 160,
      authorKind: 'ai',
      authorModel: 'Opus 5.5',
    })
    await create.call({
      cid: 'hero',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'The hero image is blurry'}],
      anchor: {source: {file: 'src/hero.tsx', line: 12}},
      x: 420,
      y: 160,
      authorKind: 'ai',
      authorModel: 'Opus 5.5',
    })
    await engine.session.tool('whiteboard_comment_reply').call({
      cid: 'hero',
      parts: [{type: 'text', text: 'A sharper export is ready'}],
    })
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_comment_read({cid: 'hero'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_comment_list({})',
      }),
      TestLLM.text('I read your reply, and only the resolved hero comment is left'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    const toggle = await screen.findByRole('button', {name: /^Comments/})
    expect(within(toggle).getByText('2')).toBeVisible()
    expect(await screen.findAllByRole('button', {name: 'AI comment, open, unread'})).toHaveLength(2)
    expect(screen.getByText('hero.tsx:12')).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await user.click(toggle)
    const inbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
    const search = within(inbox).getByRole('searchbox', {name: 'Quick search'})
    await user.type(search, 'blurry')
    expect(within(inbox).getByRole('button', {name: /The hero image is blurry/})).toBeVisible()
    expect(within(inbox).queryByRole('button', {name: /The price wraps on small screens/})).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'checkout')
    expect(within(inbox).getByText('No comments match “checkout”.')).toBeVisible()
    await user.clear(search)

    await user.click(within(inbox).getByRole('button', {name: /The hero image is blurry/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Close thread'}),
    )
    expect(await screen.findByRole('button', {name: 'AI comment, open, unread'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'AI comment, open'})).toBeVisible()
    const byDate = within(inbox).getAllByRole('button', {
      name: /The hero image is blurry|The price wraps on small screens/,
    })
    expect(byDate[0]).toHaveAccessibleName(/The hero image is blurry/)
    expect(within(inbox).getByText('1 reply')).toBeVisible()
    await user.click(within(inbox).getByRole('button', {name: 'Filter comments'}))
    await user.click(await screen.findByRole('menuitemradio', {name: 'Sort by unread'}))
    const byUnread = within(inbox).getAllByRole('button', {
      name: /The hero image is blurry|The price wraps on small screens/,
    })
    expect(byUnread[0]).toHaveAccessibleName(/The price wraps on small screens/)
    await user.click(within(inbox).getByRole('button', {name: 'Mark all as read'}))
    expect(screen.getAllByRole('button', {name: 'AI comment, open'})).toHaveLength(2)

    await user.click(within(inbox).getByRole('button', {name: /The hero image is blurry/}))
    const thread = await screen.findByRole('dialog', {name: 'Comment thread'})
    expect(within(thread).getByText('The hero image is blurry')).toBeVisible()
    const reply = within(thread).getByRole('textbox', {name: 'Reply'})
    expect(reply).toHaveFocus()
    await user.type(reply, 'On it @Opus')
    expect(await screen.findByRole('option', {name: 'Opus 5.5'})).toBeVisible()
    expect(reply).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(await within(reply).findByText('@Opus 5.5')).toBeVisible()
    expect(reply).toHaveFocus()
    await user.keyboard('{Enter}')
    const answer = await within(thread).findByText('On it')
    expect(answer).toHaveTextContent('On it @Opus 5.5')
    expect(answer).toBeVisible()

    await user.click(within(thread).getByRole('button', {name: 'Previous thread'}))
    expect(await within(thread).findByText('The price wraps on small screens')).toBeVisible()
    await user.click(within(thread).getByRole('button', {name: 'Next thread'}))
    expect(await within(thread).findByText('The hero image is blurry')).toBeVisible()
    const heroReply = within(thread).getByRole('textbox', {name: 'Reply'})
    await user.click(heroReply)
    expect(heroReply).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', {name: 'Comment thread'})).not.toBeInTheDocument()
    expect(inbox).toBeVisible()

    await user.click(within(inbox).getByRole('button', {name: /The hero image is blurry/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Resolve thread'}),
    )
    expect(within(inbox).queryByRole('button', {name: /The hero image is blurry/})).not.toBeInTheDocument()
    expect(await screen.findByRole('button', {name: 'AI comment, resolved'})).toBeVisible()
    await user.click(within(inbox).getByRole('button', {name: 'Filter comments'}))
    await user.click(await screen.findByRole('menuitemcheckbox', {name: 'Show resolved comments'}))
    expect(await within(inbox).findByRole('button', {name: /The hero image is blurry/})).toBeVisible()

    await user.click(within(inbox).getByRole('button', {name: /The price wraps on small screens/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Delete thread'}),
    )
    const confirm = await screen.findByRole('dialog', {name: 'Delete this thread?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete'}))
    expect(within(inbox).queryByRole('button', {name: /The price wraps on small screens/})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /^AI comment, open/})).not.toBeInTheDocument()
    await user.click(within(inbox).getByRole('button', {name: 'Close inbox'}))

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Did you see my reply, and what is left on the board?')
    expect(input).toHaveFocus()
    const turn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await turn.arrived
    expect(await screen.findByText('I read your reply, and only the resolved hero comment is left')).toBeVisible()
    const messages = (await engine.requests()).at(-1)?.messages
    const read = messages?.find((message) => message.toolCallId === 'c1')
    expect(JSON.parse(String(read?.content))).toMatchObject({
      success: true,
      result: {
        comment: {cid: 'hero'},
        replies: [
          {parts: [{type: 'text', text: 'A sharper export is ready'}]},
          {
            authorKind: 'human',
            parts: expect.arrayContaining([expect.objectContaining({type: 'mention', label: 'Opus 5.5'})]),
          },
        ],
      },
    })
    const listed = messages?.find((message) => message.toolCallId === 'c2')
    expect(JSON.parse(String(listed?.content))).toMatchObject({
      success: true,
      result: {comments: [{cid: 'hero', status: 'resolved'}]},
    })

    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', {name: /^Comments/})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /^AI comment/})).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })
})

describe('the user drags pins on the canvas', () => {
  test('a floating pin moves where it is dropped, and a source pin asks first, keeping its link or cutting it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    const create = engine.session.tool('whiteboard_comment_create')
    await create.call({
      cid: 'shelf',
      kind: 'floating',
      parts: [{type: 'text', text: 'The shelf needs more space'}],
      x: 200,
      y: 200,
      authorKind: 'ai',
    })
    await create.call({
      cid: 'cart',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'The cart badge overlaps'}],
      anchor: {source: {file: 'src/cart.tsx', line: 8}},
      x: 500,
      y: 200,
      authorKind: 'human',
    })
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${room}?open=true`]})})
    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))

    const shelf = await screen.findByRole('button', {name: 'AI comment, open, unread'})
    const shelfMoved = await engine.event('rpc.whiteboard.changed')
    await user.pointer([
      {keys: '[MouseLeft>]', target: shelf, coords: {clientX: 200, clientY: 200}},
      {coords: {clientX: 260, clientY: 290}},
      {keys: '[/MouseLeft]'},
    ])
    expect((await shelfMoved.arrived).data).toMatchObject({table: 'pins', type: 'upsert'})
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toEqual(
      expect.arrayContaining([expect.objectContaining({cid: 'shelf', x: 260, y: 290, pinState: 'locked'})]),
    )
    expect(screen.queryByRole('dialog', {name: 'Pin drift'})).not.toBeInTheDocument()

    const cart = screen.getByRole('button', {name: 'Human comment, open, unread'})
    expect(within(cart).getByText('cart.tsx:8')).toBeVisible()
    await user.pointer([
      {keys: '[MouseLeft>]', target: cart, coords: {clientX: 500, clientY: 200}},
      {coords: {clientX: 540, clientY: 260}},
      {keys: '[/MouseLeft]'},
    ])
    const drift = await screen.findByRole('dialog', {name: 'Pin drift'})
    expect(within(drift).getByRole('heading', {name: 'cart.tsx:8'})).toBeVisible()
    const kept = await engine.event('rpc.whiteboard.changed')
    await user.click(within(drift).getByRole('button', {name: 'Keep link, accept drift'}))
    expect((await kept.arrived).data).toMatchObject({table: 'pins', type: 'upsert'})
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({cid: 'cart', x: 540, y: 260, pinState: 'offset', anchorX: 500, anchorY: 200}),
      ]),
    )
    expect(within(cart).getByText('cart.tsx:8')).toBeVisible()

    await user.pointer([
      {keys: '[MouseLeft>]', target: cart, coords: {clientX: 540, clientY: 260}},
      {coords: {clientX: 600, clientY: 300}},
      {keys: '[/MouseLeft]'},
    ])
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Pin drift'})).getByRole('button', {
        name: 'Disconnect from source',
      }),
    )
    expect(within(cart).queryByText('cart.tsx:8')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', {name: 'Pin drift'})).not.toBeInTheDocument()
  })
})

describe('each session has its own board', () => {
  test('switching sessions swaps the board, and a board left without a tab keeps its draft when the commit times out', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [['@conciv/plugin-whiteboard', {commitDeadlineMs: 200}]]})
    const alpha = await engine.newSession('Alpha')
    const beta = await engine.newSession('Beta')
    await alpha.tool('whiteboard_comment_create').call({
      cid: 'alpha-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Alpha checkout note'}],
      x: 100,
      y: 100,
      authorKind: 'ai',
    })
    await beta.tool('whiteboard_comment_create').call({
      cid: 'beta-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Beta header note'}],
      x: 100,
      y: 100,
      authorKind: 'ai',
    })
    await beta.tool('whiteboard_comment_create').call({
      cid: 'beta-footer',
      kind: 'floating',
      parts: [{type: 'text', text: 'Beta footer note'}],
      x: 300,
      y: 100,
      authorKind: 'ai',
    })
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${alpha.id}?open=true`]})})

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    await user.click(await screen.findByRole('button', {name: /^Comments/}))
    const alphaInbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    expect(within(alphaInbox).getByText('Alpha checkout note')).toBeVisible()
    expect(within(alphaInbox).queryByText('Beta header note')).not.toBeInTheDocument()
    expect(
      await alpha.tool('whiteboard_canvas_draw').call({
        elements: [{type: 'rectangle', id: 'alpha-box', x: 0, y: 0, width: 80, height: 40}],
      }),
    ).toHaveProperty('pending')
    await user.click(within(alphaInbox).getByRole('button', {name: 'Close inbox'}))

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: /^Comments\s*2/}))
    const betaInbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    expect(await within(betaInbox).findByText('Beta header note')).toBeVisible()
    expect(within(betaInbox).queryByText('Alpha checkout note')).not.toBeInTheDocument()

    expect(await alpha.tool('whiteboard_canvas_commit').failure({})).toMatchObject({
      message: expect.stringContaining('commit timed out: no canvas tab is connected to perform it'),
    })
    expect(await alpha.tool('whiteboard_canvas_read').call({scope: 'draft'})).toMatchObject({
      scope: 'draft',
      elements: [{id: 'alpha-box', type: 'rectangle'}],
    })
  })
})

describe('the open board follows changes made from another tab', () => {
  test('a comment added and then resolved from another tab shows on the open board as it happens', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${room}?open=true`]})})
    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    expect(screen.queryByRole('button', {name: /^AI comment/})).not.toBeInTheDocument()

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'shelf',
      kind: 'floating',
      parts: [{type: 'text', text: 'The shelf needs more space'}],
      x: 200,
      y: 200,
      authorKind: 'ai',
    })
    expect(await screen.findByRole('button', {name: 'AI comment, open, unread'})).toBeVisible()
    expect(screen.getByRole('button', {name: /^Comments\s*1/})).toBeVisible()

    const [comment] = z
      .array(z.object({id: z.string()}))
      .parse(await engine.rpc.call('whiteboard', 'comments.list', {room}))
    assert(comment !== undefined)
    await engine.rpc.call('whiteboard', 'comments.update', {room, id: comment.id, patch: {status: 'resolved'}})
    expect(await screen.findByRole('button', {name: /^AI comment, resolved/})).toBeVisible()
  })
})

describe('the whiteboard settings', () => {
  test('the canvas background row starts on, and the choice holds after leaving settings', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    const general = await screen.findByRole('tab', {name: 'General', selected: true})
    const background = await screen.findByRole('switch', {name: 'Canvas background: see the page through the canvas'})
    expect(background).toBeChecked()
    await user.click(background)
    expect(background).not.toBeChecked()

    await user.click(general)
    expect(general).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('tab', {name: 'General', selected: true})).toBeVisible()
    expect(
      await screen.findByRole('switch', {name: 'Canvas background: see the page through the canvas'}),
    ).not.toBeChecked()
  })
})

describe('the user comments on an element of the page', () => {
  test('with the canvas open a picked element gets its comment straight onto the board with no toast, and with the canvas closed the user is told it was added and finds it on the board', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    onTestFinished(() => page.viewport(414, 896))
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })
    render(() => (
      <>
        <h1>Plant shop</h1>
        <button type="button" id="buy">
          Buy the fern
        </button>
      </>
    ))

    const whiteboard = await screen.findByRole('button', {name: 'Open the whiteboard canvas'})
    await user.click(whiteboard)
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Comment on an element'}))
    await realInput.click(screen.getByRole('heading', {name: 'Plant shop'}), {force: true})
    const tagline = await screen.findByRole('dialog', {name: 'New comment'})
    await user.type(within(tagline).getByRole('textbox', {name: 'Comment'}), 'The title needs a tagline')
    const added = await engine.event('rpc.whiteboard.changed')
    await user.click(within(tagline).getByRole('button', {name: 'Add comment'}))
    expect(await screen.findByRole('button', {name: /^Human comment, open/})).toBeVisible()
    await added.arrived
    expect(screen.queryByText('Comment added to the whiteboard')).not.toBeInTheDocument()

    await user.click(whiteboard)
    expect(screen.queryByRole('button', {name: /^Comments/})).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', {name: 'Comment on an element'}))
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const compose = await screen.findByRole('dialog', {name: 'New comment'})
    const comment = within(compose).getByRole('textbox', {name: 'Comment'})
    expect(comment).toHaveFocus()
    await user.type(comment, 'Make this button green')
    await user.click(within(compose).getByRole('button', {name: 'Add comment'}))

    expect(await screen.findByText('Comment added to the whiteboard')).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'New comment'})).not.toBeInTheDocument()
    expect(await engine.session.tool('whiteboard_comment_list').call({})).toMatchObject({
      comments: expect.arrayContaining([
        expect.objectContaining({
          authorKind: 'human',
          parts: [expect.objectContaining({type: 'text', text: 'Make this button green'})],
        }),
      ]),
    })
    await user.click(screen.getByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findAllByRole('button', {name: /^Human comment, open/})).toHaveLength(2)
  })
})

describe('the user draws on the canvas', () => {
  test('the user draws a rectangle with the canvas tools, it is saved to the shared board, the agent reads it, and real clicks still reach the chat composer and Settings', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    onTestFinished(() => page.viewport(414, 896))
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_canvas_read({})',
      }),
      TestLLM.text('I see the rectangle you drew'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    const rectangle = page.getByRole('radio', {name: 'Rectangle'})
    await realInput.click(rectangle, {force: true})
    await expect.element(rectangle).toBeChecked()
    const saved = await engine.event('rpc.whiteboard.changed')
    await realInput.dragAndDrop(document.body, document.body, {
      sourcePosition: {x: 300, y: 300},
      targetPosition: {x: 500, y: 440},
      force: true,
    })
    expect((await saved.arrived).data).toMatchObject({table: 'canvasElements', type: 'upsert'})

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await realInput.click(input)
    await expect.element(input).toHaveFocus()
    await realInput.keyboard('What did I draw?')
    await expect.element(input).toHaveFocus()
    const readTurn = await engine.event('session.execution.succeeded')
    await realInput.keyboard('{Enter}')
    await readTurn.arrived

    expect(await screen.findByText('I see the rectangle you drew')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: What did I draw?'})
    expect(within(reply).getByRole('button', {name: /whiteboard_canvas_read\s*1 element/})).toBeVisible()
    const read = (await engine.requests()).at(-1)?.messages.find((message) => message.toolCallId === 'c1')
    expect(JSON.parse(String(read?.content))).toMatchObject({
      success: true,
      result: {scope: 'live', elements: [{type: 'rectangle', isDeleted: false}]},
    })

    await realInput.click(page.getByRole('link', {name: 'Settings'}))
    await expect.element(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
  })
})

describe('the board stays clear while the user draws', () => {
  test('with a shape tool picked the board shows no properties panel, library or help, and keeps its toolbar, menu, comments and zoom', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    onTestFinished(() => page.viewport(414, 896))
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    const rectangle = page.getByRole('radio', {name: 'Rectangle'})
    await realInput.click(rectangle, {force: true})
    await expect.element(rectangle).toBeChecked()

    await expect.element(page.getByRole('region', {name: 'Selected shape actions', exact: true})).not.toBeInViewport()
    await expect.element(page.getByRole('checkbox', {name: 'Library', exact: true})).not.toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Help', exact: true})).not.toBeInViewport()

    await expect.element(page.getByRole('region', {name: 'Shapes', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: '', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: /^Comments/})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Zoom in', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Reset zoom', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Zoom out', exact: true})).toBeInViewport()
  })
})
