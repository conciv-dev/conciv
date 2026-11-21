import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

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
    await engine.reply(TestLLM.text('Done', 'reply'))
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

describe('a preview that could not load', () => {
  test('the user highlights a session, reads that its preview failed and closes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hi there', 'reply'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Hello')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello'})
    expect(await within(reply).findByText('Hi there')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Hello, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Hello'}))
    await user.click(await screen.findByRole('combobox', {name: 'Search sessions'}))
    await user.keyboard('{ArrowDown}')

    const preview = await screen.findByRole('dialog', {name: 'Preview of Hello'})
    expect(preview).toBeVisible()
    expect(await within(preview).findByText('Couldn’t load this session.')).toBeVisible()
    expect(within(preview).getByRole('button', {name: 'Retry'})).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', {name: 'Preview of Hello'})).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', {name: 'Search sessions'})).toBeVisible()
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
