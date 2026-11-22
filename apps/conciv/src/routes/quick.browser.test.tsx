import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('quick terminal', () => {
  test('the user opens the quick terminal on the latest session, splits it, and closes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Latest work')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/']})})

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(terminal).toBeVisible()
    expect(await within(terminal).findByRole('button', {name: 'Session: Latest work'})).toBeVisible()

    await user.click(within(terminal).getByRole('button', {name: 'Split pane'}))
    expect(await within(terminal).findByRole('button', {name: 'Session: New session'})).toBeVisible()
    expect(within(terminal).getAllByRole('button', {name: /^Session: /})).toHaveLength(2)

    await user.click(within(terminal).getByRole('button', {name: 'Close quick terminal'}))
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()

    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    const reopened = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(await within(reopened).findAllByRole('button', {name: /^Session: /})).toHaveLength(1)

    await user.click(within(reopened).getByRole('button', {name: 'Close pane'}))
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()
  })

  test('the user splits the quick terminal with the keyboard and closes it with the hotkey', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.newSession('Latest work')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/']})})

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(await within(terminal).findByRole('button', {name: 'Session: Latest work'})).toBeVisible()

    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}d{/Control}')
    expect(await within(terminal).findByRole('button', {name: 'Session: New session'})).toBeVisible()
    expect(within(terminal).getAllByRole('button', {name: /^Session: /})).toHaveLength(2)

    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()
  })
})

describe('quick terminal height', () => {
  test('the user resizes the quick terminal from the keyboard down to its floor', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/quick']})})

    const handle = await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}})
    expect(handle).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 440}}),
    ).not.toBeInTheDocument()

    await user.click(screen.getByText('quick terminal'))
    await user.tab({shift: true})
    await user.tab({shift: true})
    expect(handle).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 440}}),
    ).toBeVisible()
    await user.keyboard('{ArrowUp}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}}),
    ).toBeVisible()
    await user.keyboard('{ArrowUp>10/}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 200}}),
    ).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 176}}),
    ).not.toBeInTheDocument()
  })

  test('the quick terminal opens at the height the user left it', async () => {
    const engine = await createEngine()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/quick']}),
      seed: {storage: {'conciv-qt-height': '300'}},
    })

    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 300}}),
    ).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}}),
    ).not.toBeInTheDocument()
  })
})

describe('the host turns the quick terminal off', () => {
  test('the quick terminal route and hotkey do nothing', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/quick']}),
      host: {quickTerminal: false},
    })

    const launcher = await screen.findByRole('button', {name: 'Open conciv chat'})
    expect(launcher).toBeVisible()
    await user.hover(launcher)
    expect(await screen.findByRole('tooltip', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()

    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    await user.unhover(launcher)
    await expect.element(page.getByRole('tooltip', {name: 'Open conciv chat'})).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()
  })

  test('the host moves the quick terminal to its own hotkey', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/']}),
      host: {quickTerminal: {hotkey: 'Mod+K'}},
    })

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}k{/Control}')
    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(terminal).toBeVisible()

    expect(document.body).toHaveFocus()
    await user.keyboard('{Control>}`{/Control}')
    await user.hover(within(terminal).getByRole('button', {name: 'Split pane'}))
    expect(await screen.findByRole('tooltip', {name: /^Split pane/})).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv quick terminal'})).toBeVisible()
  })
})

describe('close one of two quick panes', () => {
  test('the user closes the Alpha pane and the Beta pane stays open', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const alpha = await engine.newSession('Alpha')
    const beta = await engine.newSession('Beta')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/quick?panes=${alpha.id},${beta.id}&focus=0`]}),
    })

    expect(await screen.findByRole('region', {name: 'Session: Alpha'})).toBeVisible()
    expect(await screen.findByRole('region', {name: 'Session: Beta'})).toBeVisible()

    await user.click(
      within(screen.getByRole('region', {name: 'Session: Alpha'})).getByRole('button', {name: 'Close pane'}),
    )
    expect(screen.queryByRole('region', {name: 'Session: Alpha'})).not.toBeInTheDocument()
    expect(screen.getByRole('region', {name: 'Session: Beta'})).toBeVisible()
  })
})

describe('quick pane context usage', () => {
  test('after a reply the quick pane shows how much of the model context the session used', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Here is the summary'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/quick']})})

    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    const input = await within(terminal).findByRole('textbox', {name: 'Message the conciv agent'})
    expect(within(terminal).queryByRole('button', {name: 'Model context usage'})).not.toBeInTheDocument()
    await user.type(input, 'Summarise the work')
    await user.click(within(terminal).getByRole('button', {name: 'Send message'}))
    expect(await within(terminal).findByText('Here is the summary')).toBeVisible()

    const usage = await within(terminal).findByRole('button', {name: 'Model context usage'})
    await user.hover(usage)
    const card = await within(terminal).findByRole('dialog', {name: 'Model context usage'})
    expect(within(card).getByText('Input')).toBeVisible()
    expect(within(card).getByText('Output')).toBeVisible()
    expect(within(usage).getByText(/^\d+(\.\d)?K$/)).toBeVisible()
    expect(within(card).getByText(/^\d+(\.\d)?K$/)).toBeVisible()
    expect(within(card).getByText('5')).toBeVisible()
  })
})
