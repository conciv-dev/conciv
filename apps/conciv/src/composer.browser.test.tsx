import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {page} from 'vitest/browser'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the composer menus', () => {
  test('a pick from the slash list or the model menu, Escape and an outside click each close the menu and give the composer its focus back at once', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})

    await user.type(input, '/dep')
    await user.click(await screen.findByRole('option', {name: '/deploy'}))
    expect(input).toHaveTextContent('/deploy')
    expect(input).toHaveFocus()

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5'}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Model'})).getByRole('option', {name: 'Sonnet 5.5'}),
    )
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    const search = await screen.findByRole('textbox', {name: 'Search models'})
    await expect.element(search).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    await expect.element(await screen.findByRole('textbox', {name: 'Search models'})).toHaveFocus()
    await page.getByText('How can I help you today?').click()
    await expect.element(input).toHaveFocus()
  })
})

describe('the model menu while a reply runs', () => {
  test('the other harness’s models are disabled and the session’s own stay enabled', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine(
      {},
      {harnesses: [{id: 'engine'}, {id: 'second', models: [{id: 'second-fast', name: 'Fast 1', group: 'Second'}]}]},
    )
    await engine.reply(TestLLM.text('Done with it'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Model: Opus 5.5 (engine)'}))
    await expect.element(page.getByRole('option', {name: 'Fast 1 (second)', disabled: true})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^Sonnet 5\.5/, disabled: false})).toBeVisible()
    await gate.release()
  })
})

describe('a draft and a send', () => {
  test('a sent message clears its session draft, and the session comes back with its messages and an empty composer', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Shipped'))
    const alpha = await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${alpha.id}?open=true`]})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Ship it')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Ship it'})
    expect(await within(reply).findByText('Shipped')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('article', {name: 'Reply to: Ship it'})).toBeVisible()
    expect(await screen.findByText('Add an instruction…')).toBeVisible()
    const backInAlpha = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(within(backInAlpha).queryByText('Ship it')).not.toBeInTheDocument()
  })
})
