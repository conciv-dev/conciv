import {describe, expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('recording keyboard shortcuts', () => {
  test('the user records a new panel key that then works, clears one, cancels one and moves a clashing one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Shortcuts'}))

    await user.click(await screen.findByRole('button', {name: 'Open or close conciv'}))
    expect(screen.getByRole('button', {name: 'Open or close conciv', pressed: true})).toBeVisible()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('button', {name: 'Open or close conciv', pressed: false})).toBeVisible()
    expect(await screen.findByText('Ctrl+K')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    await user.click(await screen.findByRole('textbox', {name: 'Message the conciv agent'}))
    expect(screen.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveFocus()
    await user.keyboard('{Control>}.{/Control}')
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('button', {name: 'Clear Quick terminal'}))
    expect(await screen.findByText('Add shortcut')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Clear Quick terminal'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Quick terminal'}))
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', {name: 'Quick terminal', pressed: false})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Quick terminal'}))
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByText(/Ctrl\+K is also/)).toHaveTextContent(
      'Ctrl+K is also Open or close conciv. Saving moves it here.',
    )
    await user.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('button', {name: 'Clear Quick terminal'})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Clear Open or close conciv'})).not.toBeInTheDocument()
    expect(screen.getByText('Add shortcut')).toBeVisible()
    expect(screen.getByText('Ctrl+K')).toBeVisible()
  })

  test('a page that turns the quick terminal off locks its shortcut rows', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      host: {quickTerminal: false},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Shortcuts'}))

    expect(
      await screen.findAllByText('The quick terminal is turned off in conciv({quickTerminal: false}).'),
    ).toHaveLength(2)
    expect(screen.getByRole('button', {name: /^Quick terminal/})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Open or close conciv'})).toBeEnabled()
  })
})
