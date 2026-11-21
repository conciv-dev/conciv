import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen, waitFor, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('focus around the panel', () => {
  test('opening the panel puts focus in the composer, Tab stays inside the panel, and closing gives the launcher its focus back', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    const composer = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await waitFor(() => expect(composer).toHaveFocus())

    await user.click(panel)
    await user.tab()
    const heightHandle = screen.getByRole('separator', {name: 'Resize chat height'})
    expect(heightHandle).toHaveFocus()
    await user.tab({shift: true})
    expect(heightHandle).not.toHaveFocus()
    expect(screen.getByRole('button', {name: 'Minimize conciv chat'})).not.toHaveFocus()
    await user.tab()
    expect(heightHandle).toHaveFocus()

    await user.keyboard('{Escape}')
    const launcher = await screen.findByRole('button', {name: 'Open conciv chat'})
    await waitFor(() => expect(launcher).toHaveFocus())
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
  })
})

describe('the panel size', () => {
  test('the user resizes the panel from the keyboard, and a drag below the floor closes it', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 680}})).toBeVisible()
    await user.click(panel)
    await user.tab()
    const heightHandle = screen.getByRole('separator', {name: 'Resize chat height'})
    expect(heightHandle).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 656}})).toBeVisible()
    await user.keyboard('{ArrowDown>20/}')
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 400}})).toBeVisible()

    await user.tab()
    const widthHandle = screen.getByRole('separator', {name: 'Resize chat width', value: {now: 500}})
    expect(widthHandle).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('separator', {name: 'Resize chat width', value: {now: 524}})).toBeVisible()
    await user.keyboard('{ArrowRight>5/}')
    expect(await screen.findByRole('separator', {name: 'Resize chat width', value: {now: 448}})).toBeVisible()

    await user.pointer([
      {keys: '[MouseLeft>]', target: heightHandle, coords: {clientX: 900, clientY: 100}},
      {coords: {clientX: 900, clientY: 700}},
      {keys: '[/MouseLeft]'},
    ])
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
  })

  test('the panel opens at the height and width the user left it', async () => {
    await page.viewport(1280, 800)
    const engine = await createEngine()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
      seed: {storage: {'conciv-modal-height': '500', 'conciv-modal-width': '600'}},
    })

    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 500}})).toBeVisible()
    expect(screen.getByRole('separator', {name: 'Resize chat width', value: {now: 600}})).toBeVisible()
  })
})

describe('the launcher corner sets where the panel grows', () => {
  test('a host that puts the launcher top left opens a panel that grows down and right', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      host: {modal: {position: 'top-left'}},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })

    await user.click(await screen.findByRole('dialog', {name: 'conciv chat agent'}))
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat height', value: {now: 680}})).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 656}})).toBeVisible()
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat width', value: {now: 500}})).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('separator', {name: 'Resize chat width', value: {now: 524}})).toBeVisible()
  })

  test('the corner the user left the launcher in wins over the host corner', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      host: {modal: {position: 'top-left'}},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
      seed: {storage: {'conciv-fab-position': 'bottom-left'}},
    })

    await user.click(await screen.findByRole('dialog', {name: 'conciv chat agent'}))
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat height', value: {now: 680}})).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 656}})).toBeVisible()
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat width', value: {now: 500}})).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('separator', {name: 'Resize chat width', value: {now: 524}})).toBeVisible()
  })

  test('Shift and an arrow on the launcher send it to that corner', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    const launcher = await screen.findByRole('button', {name: 'Open conciv chat'})
    await user.tab()
    expect(launcher).toHaveFocus()
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})

    await user.click(panel)
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat height', value: {now: 680}})).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 656}})).toBeVisible()
  })
})

describe('Escape keeps its place', () => {
  test('Escape in the terminal leaves the panel open, and Escape on settings goes back to the chat with focus on Settings', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const terminalInput = await screen.findByRole('textbox', {name: 'Terminal input'})
    await waitFor(() => expect(terminalInput).toHaveFocus())
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('tab', {name: 'Chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await user.click(screen.getByRole('link', {name: 'Settings'}))
    const general = await screen.findByRole('tab', {name: 'General', selected: true})
    await user.click(general)
    expect(general).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    const settings = screen.getByRole('link', {name: 'Settings'})
    await waitFor(() => expect(settings).toHaveFocus())
    expect(screen.queryByRole('tablist', {name: 'Settings sections'})).not.toBeInTheDocument()
  })
})

describe('notices', () => {
  test('at most three notices stand at once, an error reads as an alert, a dismissed one makes room, and an action runs', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-board']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Board'}))
    const board = await screen.findByRole('tabpanel', {name: 'Board'})
    await user.click(within(board).getByRole('button', {name: 'Raise four notices'}))

    expect(await screen.findByText('Build started')).toBeVisible()
    expect(screen.getByText('Watching the src folder')).toBeVisible()
    expect(screen.getByText('Lint passed')).toBeVisible()
    const failure = await screen.findByRole('alert')
    expect(within(failure).getByText('Deploy failed')).toBeVisible()
    expect(screen.queryByText('Tests queued')).not.toBeInTheDocument()

    await user.click(within(failure).getByRole('button', {name: 'Dismiss'}))
    expect(await screen.findByText('Tests queued')).toBeVisible()
    expect(screen.queryByText('Deploy failed')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Run tests now'}))
    expect(await within(board).findByText('Tests started')).toBeVisible()
  })
})

describe('logging in again', () => {
  test('a revoked browser moves focus from the composer to Log in, and back to the composer once it logs in', async () => {
    await page.viewport(1280, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      login: 'none',
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })

    await user.click(await screen.findByRole('button', {name: 'Unauthorized. Authorize conciv'}))
    const first = await screen.findByRole('dialog', {name: 'Authorize conciv'})
    await user.click(within(first).getByRole('textbox', {name: 'Digit 1 of 6'}))
    await user.keyboard(await engine.loginCode())
    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    const composer = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await waitFor(() => expect(composer).toHaveFocus())

    await engine.revokeBrowsers()
    const logIn = await screen.findByRole('button', {name: 'Log in'})
    await waitFor(() => expect(logIn).toHaveFocus())
    await user.keyboard('{Enter}')
    const again = await screen.findByRole('dialog', {name: 'Authorize conciv'})
    await user.click(within(again).getByRole('textbox', {name: 'Digit 1 of 6'}))
    await user.keyboard(await engine.loginCode())

    await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveFocus())
    expect(screen.queryByRole('button', {name: 'Log in'})).not.toBeInTheDocument()
  })
})

describe('phone width', () => {
  test('the panel opens as a sheet with no resize handles and no launcher, and closing brings the launcher back', async () => {
    await page.viewport(375, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    expect(screen.queryByRole('separator', {name: 'Resize chat height'})).not.toBeInTheDocument()
    expect(screen.queryByRole('separator', {name: 'Resize chat width'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Minimize conciv chat'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Close chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
  })

  test('a plugin view is a status bar tab that keeps what the user typed, and its drawer goes back to where it opened', async () => {
    await page.viewport(375, 800)
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-board']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Board'}))
    const board = await screen.findByRole('tabpanel', {name: 'Board'})
    await user.type(within(board).getByRole('textbox', {name: 'Board note'}), 'Ship on Friday')
    await user.click(screen.getByRole('tab', {name: 'Chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'Board'}))
    expect(await screen.findByRole('textbox', {name: 'Board note'})).toHaveValue('Ship on Friday')

    const details = screen.getByRole('button', {name: 'Open details'})
    await user.click(details)
    expect(await screen.findByText('The board details')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Go back'}))
    await waitFor(() => expect(details).toHaveFocus())
    expect(screen.queryByText('The board details')).not.toBeInTheDocument()
  })
})
