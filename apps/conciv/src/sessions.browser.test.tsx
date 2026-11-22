import {describe, expect, test} from 'vitest'
import {userEvent as browserInput} from 'vitest/browser'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'
import {pastSessions} from '../test/fixtures/past-sessions.js'

describe('find and switch sessions', () => {
  test('the user searches the sessions, switches to one and starts a new one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByText('Today')).toBeVisible()
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.type(search, 'zzz')
    expect(await screen.findByText('No sessions match')).toBeVisible()
    await user.tripleClick(search)
    await user.keyboard('Alp')
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()
    expect(screen.queryByRole('option', {name: /^Beta, Edited/})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Clear search'}))
    expect(search).toHaveValue('')
    expect(search).toHaveFocus()

    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))
    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()

    await engine.newSession('Gamma')
    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Gamma, Edited/})).toBeVisible()
  })
})

describe('the search lives in the route', () => {
  test('the picker opens on the search term and the all projects switch from the address', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({
      engine,
      history: createEngineRouterHistory({
        initialEntries: ['/panel/latest?open=true&sessionSearch=Alpha&allProjects=true'],
      }),
    })

    await user.click(await screen.findByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByRole('combobox', {name: 'Search sessions'})).toHaveValue('Alpha')
    expect(await screen.findByRole('switch', {name: 'All projects', checked: true})).toBeVisible()
    expect(screen.queryByRole('switch', {name: 'All projects', checked: false})).not.toBeInTheDocument()
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Session: Beta'}))
    await user.click(screen.getByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByRole('combobox', {name: 'Search sessions'})).toHaveValue('Alpha')
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()
  })
})

describe('a run in the list', () => {
  test('the picker names the harness of each session and marks the one whose reply is still working', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, {harnesses: [{id: 'alpha'}, {id: 'beta'}]})
    await engine.reply(TestLLM.text('Done'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Keep going')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /, Edited .* · alpha, running$/})).toBeVisible()

    await gate.release()
    expect(await screen.findByText('conciv replied.')).toBeVisible()
    expect(await screen.findByRole('option', {name: /, Edited .* · alpha$/})).toBeVisible()
  })
})

describe('paging the list', () => {
  test('the user moves past the first page of sessions and the next page loads', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    for (let index = 1; index <= 31; index += 1) await engine.newSession(`Session ${index}`)
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Session 31, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Session 31'}))
    expect(await screen.findByRole('option', {name: /^Session 31, Edited/})).toBeVisible()

    await user.click(screen.getByRole('combobox', {name: 'Search sessions'}))
    await user.keyboard('{ArrowDown>29/}')
    expect(await screen.findByRole('option', {name: /^Session 1, Edited/})).toBeVisible()
  })
})

describe('swap a quick pane’s session', () => {
  test('the user picks another session from a quick pane’s pill', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/quick']})})

    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    await user.click(await within(terminal).findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))

    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    expect(await within(terminal).findByRole('button', {name: 'Session: Alpha'})).toBeVisible()
  })
})

describe('preview a session', () => {
  test('the user highlights an earlier session, reads its thread in the preview, moves between the thread and the search with the Alt arrows and closes it with Escape', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('The plan has three steps'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Show me the plan')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('conciv replied.')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Show me the plan, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Show me the plan'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    await user.click(await screen.findByRole('combobox', {name: 'Search sessions'}))
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Show me the plan'})
    expect(await within(preview).findByText('The plan has three steps')).toBeVisible()
    expect(within(preview).getAllByText('Show me the plan')).toHaveLength(2)

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    expect(search).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(within(preview).getByRole('log')).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(search).toHaveFocus()
    expect(screen.getByRole('dialog', {name: 'Preview of Show me the plan'})).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', {name: 'Preview of Show me the plan'})).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', {name: 'Search sessions'})).toBeVisible()
  })
})

describe('preview a session that has no messages', () => {
  test('the user highlights a session nobody wrote in, the preview says it couldn’t load the session, and Retry asks again', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Alpha'})
    const failed = await within(preview).findByRole('alert')
    expect(failed).toHaveTextContent('Couldn’t load this session.')

    await user.click(within(failed).getByRole('button', {name: 'Retry'}))
    expect(await within(preview).findByRole('alert')).toHaveTextContent('Couldn’t load this session.')
    expect(within(preview).getByRole('button', {name: 'Retry'})).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'Preview of Alpha'})).toBeVisible()
  })
})

describe('preview a session that is still running', () => {
  test('the user starts a new session while the first one still replies and previews the running one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Done'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Keep going')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Keep going, Edited/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Keep going'})
    expect(await within(await within(preview).findByRole('log')).findByText('Keep going')).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', {name: 'Preview of Keep going'})).not.toBeInTheDocument()
    await gate.release()
  })
})

describe('past sessions the CLI started', () => {
  test('the picker files them under Yesterday and Earlier and finds one by a word of its transcript', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, pastSessions)
    await engine.newSession('Alpha')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    expect(await screen.findByRole('option', {name: /^Alpha, Edited .* · started in conciv$/})).toBeVisible()
    expect(
      await screen.findByRole('option', {name: /^Fix the login form, Edited .* · started externally$/}),
    ).toBeVisible()
    expect(await screen.findByRole('option', {name: /^Tidy the footer, Edited .* · started externally$/})).toBeVisible()
    expect(screen.getByText('Today')).toBeVisible()
    expect(screen.getByText('Yesterday')).toBeVisible()
    expect(screen.getByText('Earlier')).toBeVisible()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.type(search, 'cookie')
    const login = await screen.findByRole('option', {
      name: /^Fix the login form, Edited/,
      description: /The session cookie expires too early/,
    })
    expect(within(login).getByRole('mark')).toHaveTextContent('cookie')
    expect(screen.getByText('Yesterday')).toBeVisible()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Earlier')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', {name: /^Tidy the footer/})).not.toBeInTheDocument()

    await user.tripleClick(search)
    await user.keyboard('links')
    expect(await screen.findByRole('option', {name: /^Tidy the footer, Edited/})).toBeVisible()
    expect(screen.getByText('Earlier')).toBeVisible()
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument()
  })

  test('another project’s session shows only with All projects on', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, pastSessions)
    await engine.newSession('Alpha')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    expect(await screen.findByRole('option', {name: /^Tidy the footer, Edited/})).toBeVisible()
    expect(screen.queryByRole('option', {name: /^Ship the checkout page/})).not.toBeInTheDocument()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.type(search, 'checkout')
    expect(await screen.findByText('No sessions match')).toBeVisible()
    expect(screen.queryByRole('option', {name: /^Ship the checkout page/})).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch', {name: 'All projects', checked: false}))
    expect(
      await screen.findByRole('option', {
        name: /^Ship the checkout page, Edited .* · started externally, in storefront, select to copy the command that opens it there$/,
      }),
    ).toBeVisible()
  })

  test('the user copies another project’s resume command from its preview and from its row', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, pastSessions)
    await engine.newSession('Alpha')
    await mount({
      engine,
      history: createEngineRouterHistory({
        initialEntries: ['/panel/latest?open=true&sessionSearch=checkout&allProjects=true'],
      }),
    })

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    expect(await screen.findByRole('option', {name: /^Ship the checkout page, Edited/})).toBeVisible()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Ship the checkout page'})
    expect(await within(preview).findByText('In the cart page')).toBeVisible()
    expect(within(preview).getByText('storefront')).toBeVisible()

    const copy = within(preview).getByRole('button', {name: 'Copy resume command'})
    await user.click(copy)
    expect(await within(preview).findByRole('button', {name: 'Copied'})).toBeVisible()
    expect(await within(screen.getByRole('status', {name: 'conciv announcements'})).findByText('Copied')).toBeVisible()
    expect(copy).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', {name: 'Preview of Ship the checkout page'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', {name: /^Ship the checkout page, Edited/}))
    expect(await screen.findByRole('tooltip', {name: 'Copied'})).toBeVisible()
    expect(screen.getByRole('option', {name: /^Ship the checkout page, Edited/})).toBeVisible()
  })
})

describe('a long past session in the preview', () => {
  test('the user previews the newest page, moves into the thread with Alt+ArrowRight, goes to its start and the earlier messages load', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-migration',
                derivedTitle: 'Plan the migration',
                updatedAt: Date.now() - 60 * 60 * 1000,
                messages: Array.from({length: 25}, (_, index) => index + 1).flatMap((number) => [
                  {id: `question-${number}`, role: 'user', parts: [{type: 'text', content: `Question ${number}`}]},
                  {id: `answer-${number}`, role: 'assistant', parts: [{type: 'text', content: `Answer ${number}`}]},
                ]),
              },
            ],
          },
        ],
      },
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Plan the migration, Edited/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Plan the migration'})
    expect(await within(preview).findByRole('article', {name: 'Reply to: Question 25'})).toBeVisible()
    expect(within(preview).queryByRole('article', {name: 'You: Question 1'})).not.toBeInTheDocument()

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(within(preview).getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await within(preview).findByRole('article', {name: 'Reply to: Question 1'})).toHaveTextContent('Answer 1')
    expect(within(preview).getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await within(preview).findByRole('article', {name: 'You: Question 1'})).toBeVisible()
    expect(within(preview).getByRole('article', {name: 'Reply to: Question 1'})).toBeVisible()
  })
})
