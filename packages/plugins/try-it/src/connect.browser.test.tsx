import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {mount} from '@conciv/plugin-testkit/browser'

describe('connecting the widget to a local engine', () => {
  test('a visitor copies the command and the agent prompt, starts the engine, sees Agent connected, and the widget binds', async () => {
    const user = userEvent.setup({delay: null})
    const token = crypto.randomUUID()
    await mount({plugins: [['@conciv/plugin-try-it', {token, probeMs: 100, holdMs: 1_000}]]})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
    expect(screen.getByText('Copy the connect command')).toBeVisible()
    expect(screen.getByText('Run it in your terminal')).toBeVisible()
    expect(screen.getByText("Approve Chrome's local-network prompt")).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
    expect(screen.queryByRole('link', {name: 'quickstart'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('1')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    expect(screen.getByText('3')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Copy connect command'}))
    expect(await navigator.clipboard.readText()).toBe(`npx @conciv/try --token ${token}`)
    await expect.element(page.getByText('1', {exact: true})).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'or hand it to your coding agent'}))
    await user.click(await screen.findByRole('button', {name: 'Copy agent prompt'}))
    expect(await navigator.clipboard.readText()).toContain(
      `Run \`npx @conciv/try --token ${token}\` and keep it running`,
    )

    await createEngine({}, {port: 'connect', token})
    expect(await screen.findByText('Agent connected')).toBeVisible()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for your agent…')).not.toBeInTheDocument()

    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.queryByRole('heading', {name: 'Drive this page with your agent.'})).not.toBeInTheDocument()
  })

  test('an engine already running on a connect port binds the widget at once, with no connect steps on screen', async () => {
    const token = crypto.randomUUID()
    await createEngine({}, {port: 'connect', token})
    await mount({plugins: [['@conciv/plugin-try-it', {token}]]})

    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.queryByRole('heading', {name: 'Drive this page with your agent.'})).not.toBeInTheDocument()
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument()
  })

  test('with no engine starting, the cover points to the quickstart once the slow wait has passed', async () => {
    const token = crypto.randomUUID()
    await mount({plugins: [['@conciv/plugin-try-it', {token, probeMs: 50, slowMs: 200}]]})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
    expect(await screen.findByRole('link', {name: 'quickstart'})).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument()
  })
})
