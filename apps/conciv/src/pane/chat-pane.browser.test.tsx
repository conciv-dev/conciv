import {describe, expect, onTestFinished, test} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

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
    onTestFinished(() => page.viewport(414, 896))
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
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
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
    const engine = await createEngine({}, {tokensPerSecond: 20})
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

  test('Deny refuses the ask, the answered card leaves the list, and the tool reads denied', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.text('Main stays put'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(within(ask).getByRole('button', {name: 'Deny'}))

    expect(await screen.findByText('Main stays put')).toBeVisible()
    expect(screen.queryByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', {name: 'denied'}).at(-1)).toBeVisible()
  })

  test('on the focused card Escape denies one ask and Ctrl+Enter allows the next', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'next'})",
      }),
      TestLLM.text('Next is shipped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship a branch')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const first = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(first)
    expect(first).toHaveFocus()
    await user.keyboard('{Escape}')

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toMatchTextContent('release_ship next')
    const second = screen.getByRole('group', {name: 'Permission request'})
    await user.click(second)
    expect(second).toHaveFocus()
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByText('Next is shipped')).toBeVisible()
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
