import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
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
    expect(await within(reply).findByText('after.')).toBeVisible()
    expect(within(reply).getByRole('heading', {name: 'Plan'})).toBeVisible()
    expect(within(reply).getByRole('list')).toHaveTextContent(/Read the page.*Change the color/)
    expect(within(reply).getByRole('code')).toHaveTextContent('pnpm test')
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
    expect(kept).toHaveTextContent('Halfway there.')
    expect(kept).not.toHaveTextContent(/The very last words/)
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Be quick')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Be quick'})
    expect(await within(reply).findByText('Short answer')).toBeVisible()
    expect(screen.getByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.getByRole('article', {name: 'Reply to: Take your time'})).toHaveTextContent('Halfway there.')
  })

  test('the user stops a reply before its first word and the next turn keeps the Stopped mark', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.hang(), TestLLM.text('Here it is'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Wait for it')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await gate.release()
    await user.click(await screen.findByRole('button', {name: 'Stop generating'}))
    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Try again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Try again'})
    expect(await within(reply).findByText('Here it is')).toBeVisible()
    expect(screen.getByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Wait for it'})).not.toBeInTheDocument()
  })
})

describe('retrying a failed reply', () => {
  test('the user retries after the model fails and reads the new reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('The model is unavailable')), TestLLM.text('I am back'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Are you there')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const alert = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.getByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    await user.click(within(alert).getByRole('button', {name: 'Retry'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Are you there'})
    expect(await within(reply).findByText('I am back')).toBeVisible()
    expect(screen.queryByRole('alert', {name: 'The model is unavailable'})).not.toBeInTheDocument()
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
    expect(screen.queryByRole('list', {name: 'Execution trace'})).not.toBeInTheDocument()
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
  test('the session menu refuses a refresh while a reply runs, then refreshes the conversation and says so', async () => {
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
    await user.click(refresh)

    expect(await screen.findByText('Conversation refreshed.')).toBeVisible()
    expect(screen.getByText('Here is the page')).toBeVisible()
  })
})

describe('the agent asks for permission', () => {
  test('the ask is announced and listed with its target, the run waits, Allow once lets the tool run, and the card says it was allowed', async () => {
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
    expect(ask).toHaveTextContent('release_ship main')
    expect(within(ask).getByRole('button', {name: 'Allow always'})).toBeVisible()
    expect(within(ask).getByRole('button', {name: 'Deny'})).toBeVisible()
    expect(await screen.findByText('conciv is asking for permission.')).toBeVisible()
    const bar = screen.getByRole('toolbar', {name: 'Session status'})
    expect(within(bar).getByRole('status')).toHaveTextContent('WAITING')

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(within(ask).getByText('Allowed')).toBeVisible()
    expect(within(ask).queryByRole('button', {name: 'Allow once'})).not.toBeInTheDocument()
    expect(screen.getByText('Allowed the request')).toBeVisible()
  })

  test('Deny refuses the ask, the card says it was denied, and the tool reads denied', async () => {
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
    expect(within(ask).getByText('Denied')).toBeVisible()
    expect(screen.getByText('Denied the request')).toBeVisible()
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
    expect(await within(first).findByText('Denied')).toBeVisible()

    const asks = await screen.findAllByRole('group', {name: 'Permission request'})
    const second = asks.at(-1)
    expect(second).toHaveTextContent('release_ship next')
    if (second === undefined) return
    await user.click(second)
    expect(second).toHaveFocus()
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByText('Next is shipped')).toBeVisible()
    expect(within(second).getByText('Allowed')).toBeVisible()
  })

  test('an ask that cannot be saved offers no Allow always', async () => {
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived

    void engine.session.tool('page_eval').call({code: 'return 1 + 1'})
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    expect(within(ask).getByRole('button', {name: 'Allow once'})).toBeVisible()
    expect(within(ask).queryByRole('button', {name: 'Allow always'})).not.toBeInTheDocument()
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
