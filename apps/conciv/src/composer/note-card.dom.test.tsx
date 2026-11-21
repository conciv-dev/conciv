import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

const reviewNotes = './test/fixtures/plugins/review-notes'

describe('notes from a plugin', () => {
  test('a pill attaches a note drawn by its plugin card, Remove takes it off, and a sent note reaches the agent and stays on the message', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [reviewNotes]})
    await engine.reply(TestLLM.text('Header is sticky now', 'reply'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(await screen.findByRole('button', {name: 'Review'}))
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(within(notes).getByText('Review card')).toBeVisible()
    await user.click(within(notes).getByRole('button', {name: 'Remove Make the header sticky'}))
    expect(screen.queryByRole('list', {name: 'Notes'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Review'}))
    expect(within(await screen.findByRole('list', {name: 'Notes'})).getByText('Review card')).toBeVisible()
    await user.type(input, 'Polish the page')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await gate.release()

    const reply = await screen.findByRole('article', {name: 'Reply to: Polish the page'})
    expect(await within(reply).findByText('Header is sticky now')).toBeVisible()
    const sent = screen.getByRole('list', {name: 'Notes on this message'})
    expect(within(sent).getByText('Review card')).toBeVisible()
    expect(screen.queryByRole('list', {name: 'Notes'})).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests[0]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'Polish the page\nThe user made the following comment regarding the page header: Make the header sticky',
    })
  })
})

describe('plugin pills', () => {
  test('pills sit in their order, a row runs, a menu pill shows its content, and a pill shows only while its plugin says so', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [reviewNotes]})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await screen.findByRole('button', {name: 'Review'})
    const pills = screen.getAllByRole('button', {name: /^(Checks|Deploy status|Review)$/})
    expect(pills).toHaveLength(3)
    expect(pills[0]).toHaveAccessibleName('Checks')
    expect(pills[1]).toHaveAccessibleName('Deploy status')
    expect(pills[2]).toHaveAccessibleName('Review')

    await user.click(screen.getByRole('button', {name: 'Deploy status'}))
    expect(await screen.findByText('Staging is green')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Done'}))
    expect(screen.queryByText('Staging is green')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Checks'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Lint failed'}))
    expect(input).toHaveTextContent('Fix lint')
    expect(screen.queryByRole('button', {name: 'Checks'})).not.toBeInTheDocument()
  })
})

describe('the composer actions menu', () => {
  test('Start a new session opens an empty session', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Done with it', 'reply'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('article', {name: 'Reply to: First task'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Start a new session'}))
    expect(await screen.findByText('Ask a question…')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: First task'})).not.toBeInTheDocument()
  })
})
