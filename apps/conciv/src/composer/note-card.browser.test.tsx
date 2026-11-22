import {describe, expect, test} from 'vitest'
import {page, userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('notes from a plugin', () => {
  test('a pill attaches a note drawn by its plugin card and hands the composer focus, Remove takes it off, and a sent note reaches the agent and stays on the message', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/review-notes']})
    await engine.reply(TestLLM.text('Header is sticky now'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(await screen.findByRole('button', {name: 'Review'}))
    expect(input).toHaveFocus()
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(within(notes).getByText('Review card')).toBeVisible()
    await user.click(within(notes).getByRole('button', {name: 'Remove Make the header sticky'}))
    expect(screen.queryByRole('list', {name: 'Notes'})).not.toBeInTheDocument()
    expect(input).toHaveFocus()

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

describe('a composer note from a page comment', () => {
  test('the user picks an element of the page to comment on, the note lands in the composer, and the agent gets the comment on that element', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/review-notes']})
    await engine.reply(TestLLM.text('It is green now'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(await screen.findByRole('button', {name: 'Comment on the page'}))
    await realInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(within(notes).getByText('Make this button green')).toBeVisible()
    expect(within(notes).getByText('Page comment')).toBeVisible()
    expect(input).toHaveFocus()

    await user.keyboard('Do it')
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Do it'})
    expect(await within(reply).findByText('It is green now')).toBeVisible()
    expect(
      within(screen.getByRole('list', {name: 'Notes on this message'})).getByText('Make this button green'),
    ).toBeVisible()
    const requests = await engine.requests()
    const sent = JSON.stringify(requests[0]?.messages.at(-1))
    expect(sent).toContain('The user made the following comment regarding')
    expect(sent).toContain('Buy the fern')
    expect(sent).toContain('Make this button green')
  })
})

describe('plugin pills', () => {
  test('pills sit in their order, a row runs, a menu pill shows its content, and a pill shows only while its plugin says so', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/review-notes']})
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
    await expect.element(page.getByText('Staging is green', {exact: true})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Checks'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Lint failed'}))
    expect(input).toHaveTextContent('Fix lint')
    expect(screen.queryByRole('button', {name: 'Checks'})).not.toBeInTheDocument()
  })
})

describe('the composer actions menu', () => {
  test('Start a new session opens an empty session', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Done with it'))
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

  test('Compress the conversation compacts it, and a message sent while it compacts stays in the composer unsent', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Done with it'), TestLLM.text('A summary of the talk so far'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('article', {name: 'Reply to: First task'})).toBeVisible()

    const compaction = await engine.gate()
    await user.click(screen.getByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Compress the conversation'}))
    await compaction.started
    expect(await screen.findByRole('separator', {name: 'Compacting…'})).toBeVisible()
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await expect.element(input).toHaveTextContent('Second task')
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()

    await compaction.release()
    expect(await screen.findByRole('separator', {name: 'Context compacted'})).toBeVisible()
    expect(input).toHaveTextContent('Second task')
    expect(screen.queryByRole('article', {name: 'You: Second task'})).not.toBeInTheDocument()
    expect(await engine.requests()).toHaveLength(2)
  })
})

describe('plugin slash commands', () => {
  test('a plugin command is listed under Commands where its after places it, runs when picked, and a typed command runs with its arguments instead of sending', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/review-notes']})
    await engine.reply(TestLLM.text('Noted'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByRole('button', {name: 'Review'})).toBeVisible()
    await user.type(input, '/')
    const commands = await screen.findByRole('listbox', {name: 'Commands'})
    expect(await within(commands).findByRole('option', {name: '/summary'})).toBeVisible()
    const listed = within(commands).getAllByRole('option', {name: /^\/(model|review|summary)$/})
    expect(listed).toHaveLength(3)
    expect(listed[0]).toHaveAccessibleName('/model')
    expect(listed[1]).toHaveAccessibleName('/summary')
    expect(listed[2]).toHaveAccessibleName('/review')

    await user.click(within(commands).getByRole('option', {name: '/summary'}))
    expect(await screen.findByText('Summary ready')).toBeVisible()

    await user.type(input, '/rev')
    await user.click(await screen.findByRole('option', {name: '/review'}))
    await user.type(input, 'the header')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Reviewing the header')).toBeVisible()
    await user.type(input, 'Thanks')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Thanks'})
    expect(await within(reply).findByText('Noted')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: /review the header'})).not.toBeInTheDocument()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Thanks'})
  })
})
