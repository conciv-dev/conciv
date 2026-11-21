import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('sending with the keyboard', () => {
  test('Enter sends the typed message, the composer empties and asks for the next instruction', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hello from the agent'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByText('Ask a question…')).toBeVisible()
    await user.type(input, 'Hello agent')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('article', {name: 'You: Hello agent'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello agent'})
    expect(await within(reply).findByText('Hello from the agent')).toBeVisible()
    expect(await screen.findByText('Add an instruction…')).toBeVisible()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Hello agent'})
  })
})

describe('stopping with Escape', () => {
  test('Escape in the composer stops a reply that is still working', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Too late'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Take your time')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()
    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(await screen.findByText('Stopped')).toBeVisible()
    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
  })
})
