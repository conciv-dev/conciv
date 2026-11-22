import {describe, expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('rename a session', () => {
  test('the user hears a rename fail, then renames the session', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Rename session'}))
    const titleField = await screen.findByRole('textbox', {name: 'Session title'})
    expect(titleField).toHaveValue('New session')
    await expect.element(titleField).toHaveFocus()
    await user.clear(titleField)
    await user.type(titleField, `${'a'.repeat(121)}{Enter}`)

    expect(await screen.findByText('Rename failed')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Rename session'}))
    const retryField = await screen.findByRole('textbox', {name: 'Session title'})
    expect(retryField).toHaveValue('New session')
    await expect.element(retryField).toHaveFocus()
    await user.clear(retryField)
    await user.type(retryField, 'Release notes{Enter}')

    expect(await screen.findByText('Renamed to Release notes')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Release notes, session options'})).toBeVisible()
  })
})

describe('pop out', () => {
  test('the user is told the pop-out window could not be reopened', async () => {
    const engine = await createEngine()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true&popOut=lost`]}),
    })

    expect(await screen.findByText('The pop-out window could not be reopened.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Pop out again'})).toBeVisible()
  })
})
