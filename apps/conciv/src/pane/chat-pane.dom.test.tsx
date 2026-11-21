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
