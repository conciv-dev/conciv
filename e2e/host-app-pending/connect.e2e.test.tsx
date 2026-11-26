import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import {screen} from '@solidjs/testing-library'

describe('connecting the widget to a local engine', () => {
  test('a visitor starts the engine beside one paired to another visitor, sees Agent connected, and the widget binds, trusted, to a session that greets them as connected', async ({
    createEngine,
  }) => {
    const token = crypto.randomUUID()
    await renderTestApp({plugins: [['@conciv/plugin-try-it', {token, probeMs: 100, holdMs: 1_000}]]})
    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()

    await createEngine({}, {port: 'connect', token: crypto.randomUUID()})
    await createEngine({}, {port: 'connect', token})
    expect(await screen.findByText('Agent connected')).toBeVisible()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for your agent…')).not.toBeInTheDocument()

    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.queryByRole('heading', {name: 'Drive this page with your agent.'})).not.toBeInTheDocument()
    expect(await screen.findByText('Agent connected. It’s driving this page from your machine.')).toBeVisible()
    expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument()
    expect(screen.queryByText(/conciv couldn't connect to that workspace/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', {name: 'Authorize conciv'})).not.toBeInTheDocument()
  })

  test('an engine already running on a connect port binds the widget at once, with no connect steps on screen, and the session greets the user as connected', async ({
    createEngine,
  }) => {
    const token = crypto.randomUUID()
    await createEngine({}, {port: 'connect', token})
    await renderTestApp({plugins: [['@conciv/plugin-try-it', {token}]]})

    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.queryByRole('heading', {name: 'Drive this page with your agent.'})).not.toBeInTheDocument()
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument()
    expect(await screen.findByText('Agent connected. It’s driving this page from your machine.')).toBeVisible()
    expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument()
  })
})
