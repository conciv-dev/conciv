import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the slash list', () => {
  test('/ lists the commands of the session’s own harness and a picked one reaches the agent as text', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine(
      {},
      {harnesses: [{id: 'engine', commands: [{name: 'review-pr', description: 'Review the open pull request'}]}]},
    )
    await engine.reply(TestLLM.text('Reviewing now'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/')
    const commands = await screen.findByRole('listbox', {name: 'Commands'})
    expect(await within(commands).findByRole('option', {name: '/review-pr'})).toBeVisible()
    expect(within(commands).getByRole('option', {name: '/model'})).toBeVisible()
    expect(within(commands).queryByRole('option', {name: '/deploy'})).not.toBeInTheDocument()
    await user.type(input, 'rev')
    await user.click(await within(commands).findByRole('option', {name: '/review-pr'}))
    expect(input).toHaveTextContent('/review-pr')
    await user.type(input, '{Enter}')

    const reply = await screen.findByRole('article', {name: 'Reply to: /review-pr'})
    expect(await within(reply).findByText('Reviewing now')).toBeVisible()
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.at(-1))).toMatchObject([{role: 'user', content: '/review-pr'}])
  })
})

describe('the model command', () => {
  test('picking /model from the list or sending exactly /model opens the model menu and sends nothing', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hi there'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/mo')
    await user.click(await screen.findByRole('option', {name: '/model'}))
    const picked = await screen.findByRole('textbox', {name: 'Search models'})
    expect(picked).toBeVisible()
    await user.type(picked, '{Escape}')

    await user.type(input, '/model ')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    const search = await screen.findByRole('textbox', {name: 'Search models'})
    expect(search).toBeVisible()
    await user.type(search, '{Escape}')
    await user.type(input, 'Hello')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello'})
    expect(await within(reply).findByText('Hi there')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: /model'})).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Hello'})
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

  test('with no term, @ ranks a session open in another quick pane above a newer one that is not open', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const open = await engine.newSession('Open beside')
    await engine.newSession('Newer elsewhere')
    const typing = await engine.newSession('Typing here')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/quick?panes=${typing.id},${open.id}&focus=0`]}),
    })

    const pane = await screen.findByRole('region', {name: 'Session: Typing here'})
    await user.type(within(pane).getByRole('textbox', {name: 'Message the conciv agent'}), '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('option', {name: 'Newer elsewhere'})).toBeVisible()
    const sessions = within(context).getAllByRole('option', {name: /^(Open beside|Newer elsewhere|Typing here)$/})
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toHaveAccessibleName('Open beside')
    expect(sessions[1]).toHaveAccessibleName('Newer elsewhere')
  })

  test('a typed term finds a session of another project, which a bare @ leaves out', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'billing-elsewhere',
                cwd: '/elsewhere/billing-app',
                derivedTitle: 'Fix the billing page',
                updatedAt: 1_000,
                messages: [{id: 'm1', role: 'user', parts: [{type: 'text', content: 'the billing totals are wrong'}]}],
              },
            ],
          },
        ],
      },
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('group', {name: 'Tools'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: 'Fix the billing page'})).not.toBeInTheDocument()
    await user.type(input, 'billing')
    expect(await within(context).findByRole('option', {name: 'Fix the billing page'})).toBeVisible()
  })
})
