import {describe, expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the session rail', () => {
  test('a pop-out that could not reopen offers to pop out again, then the user renames the session and starts a new one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const session = await engine.newSession('Plan the release')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${session.id}?open=true&popOut=lost`]}),
    })

    expect(await screen.findByText('The pop-out window could not be reopened.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Pop out again'})).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Rename session'}))
    expect(screen.getByRole('textbox', {name: 'Session title'})).toHaveValue('Plan the release')
    await user.clear(screen.getByRole('textbox', {name: 'Session title'}))
    await user.type(screen.getByRole('textbox', {name: 'Session title'}), 'Ship the release{Enter}')
    expect(await screen.findByRole('button', {name: 'Ship the release, session options'})).toBeVisible()
    expect(await screen.findByText('Renamed to Ship the release')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Ship the release, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Ship the release'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()
    expect(await screen.findByText('Started a new session')).toBeVisible()
  })
})
