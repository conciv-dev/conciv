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
    await engine.reply(TestLLM.text('Done in the background'))
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
    await engine.reply(TestLLM.text('Finished'))
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

describe('the launcher while a run waits', () => {
  test('the launcher tells the user a run waits for their Allow', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_eval({code: 'return 1 + 1'})",
      }),
      TestLLM.text('Done'),
    )
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/']})})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    await control.arrived
    await user.type(
      await screen.findByRole('textbox', {name: 'Message the conciv agent'}),
      'Add one and one on the page',
    )
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('group', {name: 'Permission request'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Close chat'}))

    await user.click(await screen.findByRole('button', {name: 'Waiting for approval. Open conciv chat'}))
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await screen.findByText('conciv replied.')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Close chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('button', {name: /^Waiting for approval/})).not.toBeInTheDocument()
  })
})

describe('a run fails with a message queued', () => {
  test('the queued message goes back to the composer when the reply fails', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('The model is unavailable')))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()

    await gate.release()
    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    expect(await within(input).findByText('Second task')).toBeVisible()
    expect(input).toHaveTextContent(/^Second task$/)
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
  })
})
