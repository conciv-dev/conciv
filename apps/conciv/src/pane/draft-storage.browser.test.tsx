import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('a draft per session', () => {
  test('each session keeps its own typed draft across switches in the session picker, and a sent draft does not come back', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Shipped'))
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

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    const sendInAlpha = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(sendInAlpha).findByText('Half-written idea')).toBeVisible()
    await user.click(sendInAlpha)
    expect(sendInAlpha).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Half-written idea'})
    expect(await within(reply).findByText('Shipped')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('article', {name: 'Reply to: Half-written idea'})).toBeVisible()
    expect(await screen.findByText('Add an instruction…')).toBeVisible()
    const sentInAlpha = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(within(sentInAlpha).queryByText('Half-written idea')).not.toBeInTheDocument()
  })
})

describe('a deleted session with a draft', () => {
  test('closing the quick pane of a session deletes it, and New session on its panel carries the typed draft over', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const doomed = await engine.newSession('Doomed work')
    await mount({
      engine,
      history: createEngineRouterHistory({
        initialEntries: [`/panel/${doomed.id}?open=true`, `/quick?panes=${doomed.id}&focus=0`],
      }),
    })

    const pane = await screen.findByRole('region', {name: 'Session: Doomed work'})
    await user.type(within(pane).getByRole('textbox', {name: 'Message the conciv agent'}), 'Keep this thought')
    await user.click(within(pane).getByRole('button', {name: 'Close pane'}))

    expect(await screen.findByText('This session was deleted.')).toBeVisible()
    expect(await screen.findByText('Your draft moves to the new session.')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'New session'}))
    const moved = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(moved).findByText('Keep this thought')).toBeVisible()
    expect(screen.queryByText('This session was deleted.')).not.toBeInTheDocument()
  })
})
