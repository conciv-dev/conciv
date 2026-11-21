import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('open the chat', () => {
  test('the launcher opens the chat on the newest session', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Older')
    await engine.newSession('Newest')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/']})})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))

    expect(await screen.findByRole('button', {name: 'Newest, session options'})).toBeVisible()
  })
})

describe('a reply finishes elsewhere', () => {
  test('the user starts a new session while a reply works and still hears it finish', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Done in the background', 'reply'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Work on this')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started

    await user.click(await screen.findByRole('button', {name: /, session options$/}))
    const options = await screen.findByRole('dialog', {name: 'Session options'})
    await user.click(await within(options).findByRole('button', {name: /^Session: /}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()

    await gate.release()
    expect(await screen.findByText('conciv replied.')).toBeVisible()
  })
})

describe('the launcher while a run works', () => {
  test('the launcher says it is busy until the reply finishes', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Finished', 'reply'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/']})})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat', busy: false}))
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Run something long')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: 'Close chat'}))

    expect(await screen.findByRole('button', {name: 'Open conciv chat', busy: true})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Open conciv chat', busy: false})).not.toBeInTheDocument()

    await gate.release()
    expect(await screen.findByRole('button', {name: 'Open conciv chat', busy: false})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Open conciv chat', busy: true})).not.toBeInTheDocument()
  })
})
