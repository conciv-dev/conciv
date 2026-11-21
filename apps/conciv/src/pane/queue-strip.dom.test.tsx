import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('queueing while the agent works', () => {
  test('a message sent during a reply waits in the queue and runs after it', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()
    expect(screen.getByText('Second task')).toBeVisible()
    expect(screen.getByText('Queue another instruction…')).toBeVisible()
    await gate.release()

    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    expect(screen.getByRole('article', {name: 'Reply to: First task'})).toHaveTextContent('First answer')
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.at(-1))).toMatchObject([
      {role: 'user', content: 'First task'},
      {role: 'user', content: 'Second task'},
    ])
  })
})

describe('removing from the queue', () => {
  test('a removed message never reaches the agent', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Third answer'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Remove from queue'}))
    expect(screen.queryByText('Second task')).not.toBeInTheDocument()
    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()
    await gate.release()

    const third = await screen.findByRole('article', {name: 'Reply to: Third task'})
    expect(await within(third).findByText('Third answer')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: Second task'})).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.at(-1))).toMatchObject([
      {role: 'user', content: 'First task'},
      {role: 'user', content: 'Third task'},
    ])
  })
})

describe('steering the agent', () => {
  test('Steer takes a queued message out of the queue and interrupts the reply with it', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.hang(), TestLLM.text('Changed course'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await gate.release()
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()
    await user.type(input, 'Do this instead')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Steer'}))

    const steered = await screen.findByRole('article', {name: 'Reply to: Do this instead'})
    expect(await within(steered).findByText('Changed course')).toBeVisible()
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.at(-1))).toMatchObject([
      {role: 'user', content: 'First task'},
      {role: 'user', content: 'Do this instead'},
    ])
  })
})

describe('stopping with a queue', () => {
  test('a long queue shows three rows and a count, and Stop puts every message back in the composer in order', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Too late'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Fourth task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Fifth task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('4 waiting · runs in order')).toBeVisible()
    expect(screen.getByText('Fourth task')).toBeVisible()
    expect(screen.getByText('+1 more')).toBeVisible()
    expect(screen.queryByText('Fifth task')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.queryByText('4 waiting · runs in order')).not.toBeInTheDocument()
    expect(input.textContent).toBe('Second taskThird taskFourth taskFifth task')
  })
})
