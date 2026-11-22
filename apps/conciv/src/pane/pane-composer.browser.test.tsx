import {describe, expect, test} from 'vitest'
import {fireEvent, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('sending with the keyboard', () => {
  test('Enter sends the typed message, the composer empties and asks for the next instruction, and Enter while an IME composes does not send', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hello from the agent'))
    await engine.reply(TestLLM.text('Composed'))
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

    await user.type(input, 'Kana')
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true})
    expect(input).toHaveFocus()
    await user.keyboard('done')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Composed')).toBeVisible()
    expect((await engine.requests())[1]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Kana\ndone'})
  })
})

describe('stopping with Escape', () => {
  test('Escape in the composer stops a reply that is still working', async () => {
    const user = userEvent.setup({delay: null})
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
  })
})

describe('a revoked browser', () => {
  test('the composer locks once the engine revokes this browser: Send is disabled and typing puts nothing in it', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await mount({
      engine,
      login: 'none',
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })
    await user.click(await screen.findByRole('button', {name: 'Unauthorized. Authorize conciv'}))
    const dialog = await screen.findByRole('dialog', {name: 'Authorize conciv'})
    const firstDigit = within(dialog).getByRole('textbox', {name: 'Digit 1 of 6'})
    await user.click(firstDigit)
    expect(firstDigit).toHaveFocus()
    await user.keyboard(await engine.loginCode())
    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()

    await engine.revokeBrowsers()

    expect(await screen.findByText('Log in to continue')).toBeVisible()
    expect(screen.getByRole('button', {name: 'This browser is no longer authorized to use conciv.'})).toBeDisabled()
    await user.type(input, 'Ship it')
    expect(input).toHaveTextContent('')
    expect(screen.queryByText('Ship it')).not.toBeInTheDocument()
  })
})
