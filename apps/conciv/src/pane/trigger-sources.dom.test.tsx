import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the slash list', () => {
  test('/ lists the commands and a picked harness command reaches the agent as text', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Deploying now'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/')
    const commands = await screen.findByRole('listbox', {name: 'Commands'})
    expect(await within(commands).findByRole('option', {name: '/model'})).toBeVisible()
    expect(await within(commands).findByRole('option', {name: '/deploy'})).toBeVisible()
    await user.type(input, 'dep')
    await user.click(await within(commands).findByRole('option', {name: '/deploy'}))
    expect(input).toHaveTextContent('/deploy')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    const reply = await screen.findByRole('article', {name: 'Reply to: /deploy'})
    expect(await within(reply).findByText('Deploying now')).toBeVisible()
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.at(-1))).toMatchObject([{role: 'user', content: '/deploy'}])
  })
})

describe('the model command', () => {
  test('picking /model from the list opens the model menu', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), '/mo')
    await user.click(await screen.findByRole('option', {name: '/model'}))

    expect(await screen.findByRole('textbox', {name: 'Search models'})).toBeVisible()
  })

  test('sending exactly /model opens the model menu and sends nothing', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/model ')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('textbox', {name: 'Search models'})).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: /model'})).not.toBeInTheDocument()
    expect(await engine.requests()).toHaveLength(0)
  })
})

describe('the mention list', () => {
  test('@ lists skills, subagents, tools and this project’s other sessions, a term narrows them, and a pick inserts its mention', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: ['./test/fixtures/plugins/reviewer-agent']},
      {directory: 'test/fixtures/mention-project'},
    )
    await engine.newSession('Fix login bug')
    await engine.newSession('Deploy the docs')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('option', {name: '@release-notes'})).toBeVisible()
    expect(within(context).getByRole('option', {name: '@reviewer'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: '@build'})).not.toBeInTheDocument()
    expect(within(context).getByRole('option', {name: 'Fix login bug'})).toBeVisible()
    expect(within(context).getByRole('option', {name: 'Deploy the docs'})).toBeVisible()
    expect(within(context).getByRole('group', {name: 'Tools'})).toBeVisible()
    await user.type(input, 'login')
    expect(await within(context).findByRole('option', {name: 'src/login-form.txt'})).toBeVisible()
    expect(within(context).getByRole('option', {name: 'Fix login bug'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: 'Deploy the docs'})).not.toBeInTheDocument()
    await user.click(within(context).getByRole('option', {name: 'Fix login bug'}))

    expect(input).toHaveTextContent('@Fix login bug')
    expect(screen.queryByRole('listbox', {name: 'Context'})).not.toBeInTheDocument()
  })
})
