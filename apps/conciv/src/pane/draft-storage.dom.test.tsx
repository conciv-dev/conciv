import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('a draft per session', () => {
  test('each session keeps its own typed draft across switches in the session picker', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const alpha = await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${alpha.id}?open=true`]})})

    const alphaInput = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(alphaInput, 'Half-written idea')

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    const betaInput = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByText('Ask a question…')).toBeVisible()
    await user.type(betaInput, 'Beta notes')

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    const backInAlpha = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(backInAlpha).findByText('Half-written idea')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    const backInBeta = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(backInBeta).findByText('Beta notes')).toBeVisible()
  })
})
