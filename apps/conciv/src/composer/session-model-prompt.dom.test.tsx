import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('picking a model and an effort', () => {
  test('the prompt shows the picked model and effort, the agent runs on them, and a model with no efforts drops the effort', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('On Sonnet'), TestLLM.text('On Haiku'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5'}))
    const menu = await screen.findByRole('dialog', {name: 'Model'})
    expect(within(menu).getByRole('option', {name: 'Opus 5.5', selected: true})).toBeVisible()
    expect(within(menu).getByRole('button', {name: 'Older versions'})).toBeVisible()
    expect(within(menu).queryByRole('option', {name: 'Haiku 4.5'})).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('option', {name: 'Sonnet 5.5'}))

    await user.click(await screen.findByRole('button', {name: 'Model: Sonnet 5.5'}))
    await user.click(await screen.findByRole('radio', {name: 'High'}))
    expect(await screen.findByRole('button', {name: 'Model: Sonnet 5.5, effort High'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5, effort High'}))
    expect(screen.queryByRole('dialog', {name: 'Model'})).not.toBeInTheDocument()

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Which model?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Which model?'})
    expect(await within(reply).findByText('On Sonnet')).toBeVisible()
    expect(await engine.requests()).toMatchObject([{model: 'sonnet', effort: 'high'}])

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5, effort High'}))
    await user.click(await screen.findByRole('button', {name: 'Older versions'}))
    await user.click(await screen.findByRole('option', {name: 'Haiku 4.5'}))
    await user.click(await screen.findByRole('button', {name: 'Model: Haiku 4.5'}))
    expect(await screen.findByRole('option', {name: 'Haiku 4.5', selected: true})).toBeVisible()
    expect(screen.queryByRole('radiogroup', {name: 'Effort'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Model: Haiku 4.5'}))

    await user.type(input, 'And now?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const next = await screen.findByRole('article', {name: 'Reply to: And now?'})
    expect(await within(next).findByText('On Haiku')).toBeVisible()
    expect((await engine.requests()).at(-1)).toMatchObject({model: 'claude-haiku-4-5', effort: null})
  })
})

describe('switching the harness', () => {
  test('a model of another harness asks first when the chat has history, and the next reply runs on it', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine(
      {},
      {harnesses: [{id: 'engine'}, {id: 'second', models: [{id: 'second-fast', name: 'Fast 1', group: 'Second'}]}]},
    )
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const first = await screen.findByRole('article', {name: 'Reply to: First task'})
    expect(await within(first).findByText('First answer')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5 (engine)'}))
    await user.click(await screen.findByRole('option', {name: 'Fast 1 (second)'}))
    const confirm = await screen.findByRole('alertdialog', {name: 'Switch harness?'})
    expect(within(confirm).getByText(/Switching to second sends this chat’s history/)).toBeVisible()
    await user.click(within(confirm).getByRole('button', {name: 'Switch to second'}))

    expect(await screen.findByText('Switched to Fast 1 (second).')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Model: Fast 1 (second)'})).toBeVisible()
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    expect((await engine.requests()).map((request) => request.model)).toEqual([null, 'second-fast'])
  })
})

describe('a harness with no models', () => {
  test('the prompt names the harness and the menu says it has no usable models', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({}, {harnesses: [{id: 'engine', models: []}]})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('button', {name: 'Model: engine'}))

    expect(await screen.findByText('engine has no usable models')).toBeVisible()
  })
})
