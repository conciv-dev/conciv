import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'
import {mount} from '@conciv/plugin-testkit/browser'

describe('sending a message', () => {
  test('the user sends a message and reads the agent reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hello from the agent', 'reply'))
    await mount({engine, route: {to: '/panel/latest', search: {open: true}}})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Hello agent')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByRole('article', {name: 'You: Hello agent'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello agent'})
    expect(await within(reply).findByText('Hello from the agent')).toBeVisible()
  })
})

describe('stopping a reply', () => {
  test('the user stops a reply that is still working', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Too late', 'reply'))
    const gate = await engine.gate()
    await mount({engine, route: {to: '/panel/latest', search: {open: true}}})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Take your time')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    expect(await screen.findByText('Thinking…')).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
  })
})

describe('a failed reply', () => {
  test('the user sees the error when the model fails', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('The model is unavailable')))
    await mount({engine, route: {to: '/panel/latest', search: {open: true}}})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Are you there')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.getByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
  })
})
