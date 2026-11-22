import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

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
