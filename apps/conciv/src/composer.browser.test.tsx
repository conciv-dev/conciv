import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {page} from 'vitest/browser'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the composer menus', () => {
  test('a pick from the slash list or the model menu, Escape and an outside click each close the menu and give the composer its focus back at once', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})

    await user.type(input, '/dep')
    await user.click(await screen.findByRole('option', {name: '/deploy'}))
    expect(input).toHaveTextContent('/deploy')
    expect(input).toHaveFocus()

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5'}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Model'})).getByRole('option', {name: 'Sonnet 5.5'}),
    )
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    const search = await screen.findByRole('textbox', {name: 'Search models'})
    await expect.element(search).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    await expect.element(await screen.findByRole('textbox', {name: 'Search models'})).toHaveFocus()
    await page.getByText('How can I help you today?').click()
    await expect.element(input).toHaveFocus()
  })
})
