import {describe, expect, test} from 'vitest'
import {page, userEvent as browserInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('a saved session that failed', () => {
  test('the run failure shows again when the user comes back to the session, with its Retry', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('The model is unavailable')))
    await expect(engine.session.send('Are you there')).rejects.toThrow('The model is unavailable')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    expect(await screen.findByRole('article', {name: 'You: Are you there'})).toBeVisible()
    const alert = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(within(alert).getByRole('button', {name: 'Retry'})).toBeVisible()
  })
})

describe('a reply with a diagram', () => {
  test('the user reads a drawn diagram, a code block as code, and a diagram that fails to draw as its source in plain text', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text(
        '```mermaid\nthis is not a diagram\n```\n\n```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n\n```ts\nconst total = 1 + 1\n```\n\nOne of them draws.',
      ),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Draw both')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Draw both'})

    expect(await within(reply).findByRole('graphics-document')).toBeVisible()
    expect(within(reply).getByText('Start')).toBeVisible()
    expect(within(reply).getByText('Done')).toBeVisible()
    expect(within(reply).getAllByRole('graphics-document')).toHaveLength(1)
    expect(within(reply).getByText('this is not a diagram')).toBeVisible()
    await expect
      .element(page.getByRole('article', {name: 'Reply to: Draw both'}).getByText('const total = 1 + 1'))
      .toBeVisible()
  })
})

describe('a long saved session', () => {
  test('the user scrolls to the start, earlier messages load in order, and Latest brings the end back', async () => {
    await page.viewport(1280, 500)
    const engine = await createEngine()
    await engine.reply(
      ...Array.from({length: 26}, (_, index) =>
        TestLLM.text(
          `Answer ${index + 1}\n\nThe migration moves each table in its own step, checks the row counts on both sides, and keeps the old table readable until the new one has served a full day of traffic without a single error.`,
        ),
      ),
    )
    for (const index of Array.from({length: 26}, (_, offset) => offset + 1)) {
      await engine.session.send(`Question ${index}`)
    }
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    const last = await screen.findByRole('article', {name: 'Reply to: Question 26'})
    expect(await within(last).findByText('Answer 26')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Question 1'})).not.toBeInTheDocument()
    const latest = page.getByRole('button', {name: 'Scroll to bottom', includeHidden: true})
    await expect.element(latest).toBeDisabled()

    await browserInput.click(last)
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await screen.findByRole('article', {name: 'Reply to: Question 1'})).toBeVisible()
    const rows = screen.getAllByRole('article')
    expect(rows[0]).toHaveAccessibleName('You: Question 1')
    expect(rows[1]).toHaveAccessibleName('Reply to: Question 1')
    expect(rows[2]).toHaveAccessibleName('You: Question 2')
    expect(rows[3]).toHaveAccessibleName('Reply to: Question 2')
    await expect.element(latest).toBeEnabled()
    await expect.element(latest).toBeVisible()
    await expect.element(latest).toHaveTextContent('Latest')
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    await expect.element(page.getByRole('article', {name: 'You: Question 1'})).toBeInViewport()

    await latest.click()
    expect(await screen.findByText('Answer 26')).toBeVisible()
    await expect.element(latest).toBeDisabled()
  })
})

describe('a fresh session', () => {
  test('the user starts a conversation from a starter', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('This page is a demo shop'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByText('How can I help you today?')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByRole('article', {name: 'You: Explain this page'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Explain this page'})
    expect(await within(reply).findByText('This page is a demo shop')).toBeVisible()
    expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument()
    expect(screen.getByRole('separator', {name: 'New session'})).toBeVisible()
  })
})

describe('a markdown reply', () => {
  test('the user reads a reply with a heading, a list and inline code', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('## Plan\n\n- Read the page\n- Change the color\n\nRun `pnpm test` after.'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Make a plan')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByRole('article', {name: 'You: Make a plan'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Make a plan'})
    expect(await within(reply).findByText(/after\./)).toBeVisible()
    expect(within(reply).getByRole('heading', {name: 'Plan'})).toBeVisible()
    const list = within(reply).getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchTextContent('Read the page')
    expect(items[1]).toMatchTextContent('Change the color')
    expect(within(reply).getByRole('code')).toMatchTextContent('pnpm test')
  })
})

describe('a reply that thinks before it answers', () => {
  test('the user reads the plan row with its first line, the whole plan below it, and the trace summed up as reasoning', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.thinking('Read the cart first\nThen check the price', 'The fern costs ten euros'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'What does the fern cost')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: What does the fern cost'})
    expect(await within(reply).findByText('The fern costs ten euros')).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Hide trace/})).toMatchTextContent('reasoning')
    const trace = within(reply).getByRole('list', {name: 'Execution trace'})
    expect(within(trace).getByText('plan')).toBeVisible()
    expect(within(trace).getByText('Read the cart first')).toBeVisible()
    expect(within(trace).getByText(/Then check the price/)).toBeVisible()
  })
})

describe('a message with no words', () => {
  test('a grabbed element sent alone reads as an attachment, and a note sent alone as a note', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/review-notes']})
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(TestLLM.text('That button buys the fern'), TestLLM.text('The header is sticky now'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Select an element from the page'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await browserInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    expect(await screen.findByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('That button buys the fern')).toBeVisible()
    expect(screen.getByRole('article', {name: 'You: 1 attachment'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Review'}))
    expect(await screen.findByRole('list', {name: 'Notes'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('The header is sticky now')).toBeVisible()
    const sent = screen.getByRole('article', {name: 'You: 1 note'})
    expect(within(sent).getByRole('list', {name: 'Notes on this message'})).toBeVisible()
  })
})

describe('stopping and sending again', () => {
  test('the user stops a streaming reply, keeps its text marked stopped, and sends again', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, {tokensPerSecond: 400})
    await engine.reply(
      TestLLM.text(`Halfway there. ${'More words keep coming. '.repeat(500)}The very last words.`),
      TestLLM.text('Short answer'),
    )
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Take your time')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    expect(await screen.findByText('Thinking…')).toBeVisible()
    await gate.release()
    const stopped = await screen.findByRole('article', {name: 'Reply to: Take your time'})
    expect(await within(stopped).findByText('there.')).toBeVisible()
    expect(screen.getByText('Responding…')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    const kept = screen.getByRole('article', {name: 'Reply to: Take your time'})
    expect(kept).toMatchTextContent('Halfway there.')
    expect(kept).not.toMatchTextContent('The very last words')
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Be quick')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Be quick'})
    expect(await within(reply).findByText('Short answer')).toBeVisible()
    expect(screen.getByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.getByRole('article', {name: 'Reply to: Take your time'})).toMatchTextContent('Halfway there.')
  })

  test('a Stop before the first word shows STOPPING and Stopping… until the run ends, then STOPPED, and the next turn leaves no reply for the stopped one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Never shown'), TestLLM.text('Here it is'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Wait for it')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: 'Stop generating'}))

    expect(await within(bar).findByText('STOPPING')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Stopping the run'})).toBeVisible()
    expect(await within(bar).findByText('STOPPED')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Stopping the run'})).not.toBeInTheDocument()
    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Try again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Try again'})
    expect(await within(reply).findByText('Here it is')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Wait for it'})).not.toBeInTheDocument()
    expect(screen.queryByText('Never shown')).not.toBeInTheDocument()
  })
})

describe('a reply that reads the page before it answers', () => {
  test('the trace the user hid while the reply waited stays hidden when the answer arrives', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: 'return await external_page_route({})'}),
      TestLLM.text('You are on the home page'),
    )
    const toolCall = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Where am I')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await toolCall.started
    const answer = await engine.gate()
    await toolCall.release()
    await answer.started
    const reply = await screen.findByRole('article', {name: 'Reply to: Where am I'})
    expect(await within(reply).findByText('Read the route')).toBeVisible()
    await user.click(within(reply).getByRole('button', {name: /Hide trace/}))
    await answer.release()

    expect(await screen.findByText('You are on the home page')).toBeVisible()
    expect(screen.getByRole('button', {name: /Show trace/})).toHaveFocus()
    await expect.element(page.getByRole('list', {name: 'Execution trace'})).not.toBeInTheDocument()
  })
})

describe('the actions under a reply', () => {
  test('the user copies a reply and hears it, then asks for the reply again and reads the new answer', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('The first answer'), TestLLM.text('The second answer'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Answer me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Answer me'})
    expect(await within(reply).findByText('The first answer')).toBeVisible()
    const actions = await screen.findByRole('toolbar', {name: 'Message actions'})
    await user.click(within(actions).getByRole('button', {name: 'Copy'}))
    expect(await screen.findByText('Copied the message')).toBeVisible()

    await user.click(within(actions).getByRole('button', {name: 'Refresh'}))
    expect(await screen.findByText('The second answer')).toBeVisible()
    expect(screen.queryByText('The first answer')).not.toBeInTheDocument()
  })
})

describe('refreshing the conversation', () => {
  test('the session menu refuses a refresh while a reply runs, shows the reply token counts, then refreshes and says so', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Here is the page'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Read the page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: /, session options$/}))
    const options = await screen.findByRole('dialog', {name: 'Session options'})
    const refresh = within(options).getByRole('button', {name: 'Refresh the conversation'})
    expect(refresh).toBeDisabled()

    await gate.release()
    expect(await screen.findByText('Here is the page')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(refresh).toBeEnabled()
    expect(await within(options).findByText('Input')).toBeVisible()
    expect(within(options).getByText('Output')).toBeVisible()
    await user.click(refresh)

    expect(await screen.findByText('Conversation refreshed.')).toBeVisible()
    expect(screen.getByText('Here is the page')).toBeVisible()
  })
})

describe('how full the model context is', () => {
  test('after a reply the session menu shows the share of the context window used and a bar filled to it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, {harnesses: [{id: 'engine', contextTokens: 24_000, contextWindow: 200_000}]})
    await engine.reply(TestLLM.text('Counted'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Count the tokens')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Counted')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: /, session options$/}))

    const options = await screen.findByRole('dialog', {name: 'Session options'})
    expect(await within(options).findByText('12%')).toBeVisible()
    expect(within(options).getByText('24K / 200K')).toBeVisible()
    expect(within(options).getByRole('progressbar', {name: 'Model context usage', value: {now: 12}})).toBeVisible()
  })
})

describe('a conversation too long for the model', () => {
  test('the user compacts from the overflow row, watches it compact, and goes on after the Context compacted mark', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.failAfter(Object.assign(new Error('prompt is too long'), {code: 'context_overflow'})),
      TestLLM.text('A summary of the talk so far'),
      TestLLM.text('Back to work'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Keep going')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const overflow = await screen.findByRole('alert', {
      name: 'This conversation is too long for the model. Compact it to keep going.',
    })
    const compaction = await engine.gate()
    await user.click(within(overflow).getByRole('button', {name: 'Compact conversation'}))
    await compaction.started

    expect(await screen.findByRole('separator', {name: 'Compacting…'})).toBeVisible()
    expect(screen.getByRole('status', {name: 'Compacting context…'})).toBeVisible()
    await compaction.release()
    expect(await screen.findByRole('separator', {name: 'Context compacted'})).toBeVisible()
    expect(
      screen.queryByRole('alert', {name: 'This conversation is too long for the model. Compact it to keep going.'}),
    ).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Go on')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Go on'})
    expect(await within(reply).findByText('Back to work')).toBeVisible()
  })
})

describe('the agent asks for permission', () => {
  test('the ask is announced and listed with its target, the run waits, Allow once lets the tool run, and the answered card leaves the list', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.text('Main is shipped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const list = await screen.findByRole('list', {name: 'Permission requests'})
    const ask = within(list).getByRole('group', {name: 'Permission request'})
    expect(ask).toMatchTextContent('release_ship main')
    expect(within(ask).getByRole('button', {name: 'Allow always'})).toBeVisible()
    expect(within(ask).getByRole('button', {name: 'Deny'})).toBeVisible()
    expect(await screen.findByText('conciv is asking for permission.')).toBeVisible()
    const bar = screen.getByRole('toolbar', {name: 'Session status'})
    expect(within(bar).getByRole('status')).toHaveTextContent('WAITING')
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(screen.queryByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  })

  test('an ask answered from another window leaves this page without its buttons and the run goes on', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.text('Main is shipped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('button', {name: 'Allow once'})).toBeVisible()

    await engine.session.approve()

    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Allow once'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
  })

  test('Deny refuses an ask and the tool reads denied, then on the focused card Escape denies the next ask and Ctrl+Enter allows the one after', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'next'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'beta'})",
      }),
      TestLLM.text('Beta is shipped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship a branch')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const denied = await screen.findByRole('group', {name: 'Permission request'})
    expect(denied).toMatchTextContent('release_ship main')
    await user.click(within(denied).getByRole('button', {name: 'Deny'}))

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toMatchTextContent('release_ship next')
    expect((await screen.findAllByRole('img', {name: 'denied'})).at(-1)).toBeVisible()
    const first = screen.getByRole('group', {name: 'Permission request'})
    await user.click(first)
    expect(first).toHaveFocus()
    await user.keyboard('{Escape}')

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toMatchTextContent('release_ship beta')
    const second = screen.getByRole('group', {name: 'Permission request'})
    await user.click(second)
    expect(second).toHaveFocus()
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByText('Beta is shipped')).toBeVisible()
    expect(screen.queryByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  })

  test('an ask that cannot be saved offers no Allow always', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    const call = engine.session.tool('page_eval').call({code: 'return 1 + 1'})
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    expect(within(ask).getByRole('button', {name: 'Allow once'})).toBeVisible()
    expect(within(ask).queryByRole('button', {name: 'Allow always'})).not.toBeInTheDocument()

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))
    await expect(call).resolves.toEqual({result: 2})
  })

  test('Stop while the card is open takes the ask away', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('group', {name: 'Permission request'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Allow once'})).not.toBeInTheDocument()
  })
})

describe('the engine goes away for a moment', () => {
  test('while the engine restarts Refresh waits and a failed reply hides its error, and once it is back the error and its Retry return and Retry gets the new reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text('Here is the page'),
      TestLLM.failAfter(new Error('The model is unavailable')),
      TestLLM.text('I am back'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Read the page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Here is the page')).toBeVisible()
    const refresh = page.getByRole('toolbar', {name: 'Message actions'}).getByRole('button', {name: 'Refresh'})
    await expect.element(refresh).toBeEnabled()

    const firstRestart = engine.restart()
    expect(await screen.findByText('conciv lost connection to the engine.')).toBeVisible()
    await expect.element(refresh).toBeDisabled()
    await firstRestart
    await expect.element(page.getByText('conciv lost connection to the engine.')).not.toBeInTheDocument()
    await expect.element(refresh).toBeEnabled()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Read it again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const failed = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(within(failed).getByRole('button', {name: 'Retry'})).toBeVisible()

    const secondRestart = engine.restart()
    expect(await screen.findByText('conciv lost connection to the engine.')).toBeVisible()
    await expect.element(page.getByRole('alert', {name: 'The model is unavailable'})).not.toBeInTheDocument()
    await secondRestart
    const back = await screen.findByRole('alert', {name: 'The model is unavailable'})
    await user.click(within(back).getByRole('button', {name: 'Retry'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Read it again'})
    expect(await within(reply).findByText('I am back')).toBeVisible()
    expect(screen.queryByRole('alert', {name: 'The model is unavailable'})).not.toBeInTheDocument()
  })
})

describe('the session status chip', () => {
  test('a fresh session shows no chip, a run shows RUNNING and RUNNING 1/2 with a queued message, then DONE, and a failed run shows FAILED with its reason', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text('First answer'),
      TestLLM.text('Second answer'),
      TestLLM.failAfter(new Error('The model is unavailable')),
    )
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    expect(within(bar).queryByRole('status')).not.toBeInTheDocument()
    expect(within(bar).getByText('--')).toBeVisible()

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await within(bar).findByRole('status')).toHaveTextContent('RUNNING')

    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await within(bar).findByText('RUNNING 1/2')).toBeVisible()

    await gate.release()
    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()
    expect(within(bar).getByText(/^\d{2}:\d{2}$/)).toBeVisible()
    expect(within(bar).queryByText('--')).not.toBeInTheDocument()

    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    const failed = page.getByRole('toolbar', {name: 'Session status', exact: true}).getByRole('status')
    await expect.element(failed).toHaveTextContent('FAILED')
    await expect.element(failed).toHaveAccessibleDescription('The model is unavailable')
  })

  test('an edit that failed changed no file, so the status bar counts no files or lines', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'Edit', {file_path: 'src/app.ts', old_string: 'one', new_string: 'two\nthree'}),
      TestLLM.text('The edit did not go through'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Change the app')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('The edit did not go through')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()

    expect(within(bar).queryByText('1 file')).not.toBeInTheDocument()
    expect(within(bar).queryByText('+2')).not.toBeInTheDocument()
    expect(within(bar).queryByText('−1')).not.toBeInTheDocument()
  })
})

describe('the agent asks a choice', () => {
  test('the user picks one of the offered answers and the agent goes on with it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']})",
      }),
      TestLLM.text('Blue it is'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which color?')).toBeVisible()
    expect(screen.getByText('Rendered choices')).toBeVisible()
    expect(screen.getByRole('status', {name: 'Agent activity'})).toMatchTextContent('conciv_ui')
    expect(screen.getAllByRole('img', {name: 'running'}).at(-1)).toBeVisible()
    expect(screen.queryByRole('img', {name: 'complete'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Blue'}))

    expect(await screen.findByText('Blue it is')).toBeVisible()
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', {name: 'complete'}).at(-1)).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Pick a color with me'})
    expect(within(reply).getByText('Blue')).toBeVisible()
    expect(within(reply).queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    const answer = (await engine.requests()).at(-1)?.messages.at(-1)
    expect(answer?.role).toBe('tool')
    expect(answer?.content).toContain('"value":"Blue"')
  })
})

describe('the user stops while the agent asks', () => {
  test('the open question ends as interrupted at once and stays so after the next reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']})",
      }),
      TestLLM.text('Here it is'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('button', {name: 'Red'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(await screen.findByText('Tool execution interrupted')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Never mind')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Here it is')).toBeVisible()
    await user.click(screen.getByRole('button', {name: /Show trace/}))
    await expect.element(page.getByText('Tool execution interrupted', {exact: true})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
  })
})

describe('a plugin draws its own tool cards', () => {
  test('a plugin card shows open, a failed call draws the plugin error card, and a card that throws falls back to the generic card', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_check({branch: 'main'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_release_block({branch: 'main'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_release_notes({branch: 'main'})",
      }),
      TestLLM.text('Main is checked'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Can main ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Main is checked')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Can main ship'})
    expect(within(reply).getByText('Release card for main')).toBeVisible()
    expect(within(reply).getByText(/^Release held: .*The release train is frozen/)).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Called release_notes/})).toBeVisible()
  })
})

describe('a plugin fills the session header and status', () => {
  test('the header slot and the status slot show what the plugin draws', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByText('Release train: on time')).toBeVisible()
    expect(await screen.findByText('Next train at noon')).toBeVisible()
  })
})

describe('opening a tool card while the turn goes on', () => {
  test('the user opens the card of a tool with no card of its own, its body shows, and it stays open when the answer arrives', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_window({branch: 'main'})",
      }),
      TestLLM.text('The window is set'),
    )
    const toolCall = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'When can we ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await toolCall.started
    const answer = await engine.gate()
    await toolCall.release()
    await answer.started
    const reply = await screen.findByRole('article', {name: 'Reply to: When can we ship'})
    expect(await within(reply).findAllByText('"noon to two"')).toHaveLength(1)
    await user.click(within(reply).getByRole('button', {name: /Called release_window/}))
    const opened = page.elementLocator(reply).getByText('"noon to two"', {exact: true})
    await expect.element(opened).toHaveLength(2)
    await expect.element(opened.last()).toBeVisible()

    await answer.release()
    expect(await screen.findByText('The window is set')).toBeVisible()
    expect(within(reply).getAllByText('"noon to two"')).toHaveLength(2)
    expect(within(reply).getAllByText('"noon to two"').at(-1)).toBeVisible()
    const durations = await within(reply).findAllByText(/^\d+\.\ds$/)
    expect(durations.at(-1)).toBeVisible()
  })
})

describe('the agent asks other kinds of question', () => {
  test('a multi-select question submits the pressed options and a typed other, and Submit waits for a choice', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which toppings?', options: ['Olives', 'Basil', 'Garlic'], multiSelect: true, allowOther: true})",
      }),
      TestLLM.text('Pizza ordered'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Order a pizza')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which toppings?')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Submit'})).toBeDisabled()
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    await user.click(screen.getByRole('button', {name: 'Basil'}))
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    expect(await screen.findByRole('button', {name: 'Basil', pressed: true})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Olives', pressed: false})).toBeVisible()
    await user.type(screen.getByRole('textbox', {name: 'Other'}), 'Chili')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Pizza ordered')).toBeVisible()
    const answer = (await engine.requests()).at(-1)?.messages.at(-1)
    expect(answer?.role).toBe('tool')
    expect(answer?.content).toContain('"value":["Basil","Chili"]')
  })

  test.each([
    {
      kind: 'confirm',
      call: "return await external_conciv_ui({kind: 'confirm', question: 'Delete the build folder?', detail: 'rm -r dist'})",
      prompt: 'Clean the build',
      question: 'Delete the build folder?',
      detail: 'rm -r dist',
      other: 'Deny',
      button: 'Approve',
      reply: 'Build folder deleted',
      value: '"value":"yes"',
    },
    {
      kind: 'diff',
      call: "return await external_conciv_ui({kind: 'diff', question: 'Apply this change?', file: 'src/title.ts', before: 'export const title = 1', after: 'export const title = 2'})",
      prompt: 'Bump the title',
      question: 'Apply this change?',
      detail: 'src/title.ts',
      other: 'Apply',
      button: 'Reject',
      reply: 'Change dropped',
      value: '"value":"reject"',
    },
  ])(
    'a $kind question shows its detail, offers $other, and $button sends its answer',
    async ({call, prompt, question, detail, other, button, reply, value}) => {
      const user = userEvent.setup()
      const engine = await createEngine()
      await engine.reply(TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: call}), TestLLM.text(reply))
      await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

      await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), prompt)
      await user.click(screen.getByRole('button', {name: 'Send message'}))
      expect(await screen.findByText(question)).toBeVisible()
      await expect.element(page.getByText(detail)).toBeVisible()
      expect(screen.getByRole('button', {name: other})).toBeVisible()
      await user.click(screen.getByRole('button', {name: button}))

      expect(await screen.findByText(reply)).toBeVisible()
      expect((await engine.requests()).at(-1)?.messages.at(-1)?.content).toContain(value)
    },
  )

  test('a form question sends the typed text and the first select option by default, and shows the answers', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'form', title: 'New page', fields: [{name: 'path', label: 'Path', type: 'text'}, {name: 'layout', label: 'Layout', type: 'select', options: ['Wide', 'Narrow']}]})",
      }),
      TestLLM.text('Page created'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Make a page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const path = await screen.findByRole('textbox', {name: 'Path'})
    await user.type(path, '/pricing')
    expect(screen.getByRole('textbox', {name: 'Path'})).toBe(path)
    expect(path).toHaveFocus()
    expect(screen.getByRole('combobox', {name: 'Layout'})).toMatchTextContent('Wide')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Page created')).toBeVisible()
    expect((await engine.requests()).at(-1)?.messages.at(-1)?.content).toContain(
      '"value":{"path":"/pricing","layout":"Wide"}',
    )
    const reply = screen.getByRole('article', {name: 'Reply to: Make a page'})
    expect(within(reply).getByText('/pricing')).toBeVisible()
  })
})

describe('the agent runs a program', () => {
  test('each run shows as an exec card with its first code line and status, the logs and result of one and the error of the other', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "console.log('counting the items')\nreturn 2 + 3",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {typescriptCode: "throw new Error('The cart is empty')"}),
      TestLLM.text('Five items'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Count them')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Five items')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Count them'})
    expect(within(reply).getByText('2 execs')).toBeVisible()
    const passed = within(reply).getByRole('button', {name: /console\.log\('counting the items'\)/})
    expect(within(passed).getByRole('img', {name: 'succeeded'})).toBeVisible()
    expect(within(passed).getByText('exec')).toBeVisible()
    expect(within(passed).getByText('ok')).toBeVisible()
    const failed = within(reply).getByRole('button', {name: /throw new Error\('The cart is empty'\)/})
    expect(within(failed).getByRole('img', {name: 'failed'})).toBeVisible()
    expect(within(failed).getByText('error')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Output'}).getByText('counting the items')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'result.json'}).getByText('5')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Error output'}).getByText(/The cart is empty/)).toBeVisible()
  })
})

describe('an outside agent calls a tool', () => {
  test('the call shows in the open thread tagged with the agent that made it, and the agent gets the result', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    const reply = await engine
      .outside({client: 'conciv-test', tab: engine.session.id})
      .call('release_window', {branch: 'main'})

    expect(reply).toMatchObject({content: [{type: 'text', text: expect.stringContaining('noon to two')}]})
    expect(await screen.findByText('ok')).toBeVisible()
    expect(screen.getAllByText('from conciv-test')).toHaveLength(2)
    expect(screen.queryByRole('article', {name: /^You:/})).not.toBeInTheDocument()
  })
})

describe('the agent opens a file in the editor', () => {
  test('the open card names the file and line and says it opened, and the editor gets the file at that line', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_open({file: 'src/app.ts', line: 12})",
      }),
      TestLLM.text('It is open'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Show me the app file')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('It is open')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Show me the app file'})
    expect(within(reply).getByText('open')).toBeVisible()
    expect(within(reply).getByText('src/app.ts:12')).toBeVisible()
    expect(within(reply).getByText('Opened in your editor.')).toBeVisible()
    expect(await engine.opened()).toEqual([{file: 'src/app.ts', line: 12}])
  })
})
