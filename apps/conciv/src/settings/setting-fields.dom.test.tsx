import {describe, expect, test} from 'vitest'
import {screen, waitForElementToBeRemoved} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the general settings change the panel', () => {
  test('the user picks a colour mode, a skin, hides the launcher and brings it back, and closes the panel with a page click', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    await user.click(await screen.findByRole('radio', {name: 'Dark'}))
    await user.click(screen.getByRole('radio', {name: 'Terminal'}))
    await user.click(screen.getByRole('combobox', {name: 'Launcher'}))
    await user.click(await screen.findByRole('option', {name: 'Hidden'}))
    await waitForElementToBeRemoved(() => screen.queryByRole('button', {name: 'Minimize conciv chat'}))

    await user.click(screen.getByRole('combobox', {name: 'Launcher'}))
    await user.click(await screen.findByRole('option', {name: 'Mascot'}))
    expect(await screen.findByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'Close on outside click'}))
    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.getByRole('radio', {name: 'Terminal'})).toBeChecked()
    expect(screen.getByRole('switch', {name: 'Close on outside click'})).toBeChecked()

    await user.click(document.body)
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
  })

  test('a project that chose to open on page load shows the panel when the page loads', async () => {
    const engine = await createEngine()
    await engine.setting({scope: 'project', namespace: 'conciv', key: 'openOnLoad', value: true})
    await mount({engine})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })

  test('a launcher and an open on load set by the page are shown locked in settings', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, host: {launcher: 'native', defaultOpen: true}})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('combobox', {name: 'Launcher'})).toHaveTextContent('Native')
    expect(screen.getByText('Set in conciv({launcher}) by this project.')).toBeVisible()
    expect(screen.getByText('Set in conciv({defaultOpen}) by this project.')).toBeVisible()
  })
})
