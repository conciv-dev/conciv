import {describe, expect, test} from 'vitest'
import {page, userEvent as browserUserEvent} from 'vitest/browser'
import {cleanup, render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the panel size', () => {
  test('the user resizes the panel from the keyboard, and a drag below the floor closes it', async () => {
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
    await expect.element(panel).not.toBeVisible()
  })

  test('the panel opens at the height and width the user left it', async () => {
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
  test.each([
    {corner: 'the host top left corner', seed: {storage: {}}, grow: '{ArrowUp}'},
    {
      corner: 'the bottom left corner the user left it in, over the host top left corner',
      seed: {storage: {'conciv-fab-position': 'bottom-left'}},
      grow: '{ArrowDown}',
    },
  ])('a launcher in $corner opens a panel that grows from that corner', async ({seed, grow}) => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      host: {modal: {position: 'top-left'}},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
      seed,
    })

    await user.click(await screen.findByRole('dialog', {name: 'conciv chat agent'}))
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat height', value: {now: 680}})).toHaveFocus()
    await user.keyboard(grow)
    expect(await screen.findByRole('separator', {name: 'Resize chat height', value: {now: 656}})).toBeVisible()
    await user.tab()
    expect(screen.getByRole('separator', {name: 'Resize chat width', value: {now: 500}})).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('separator', {name: 'Resize chat width', value: {now: 524}})).toBeVisible()
  })

  test('Shift and an arrow on the launcher send it to that corner', async () => {
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
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const terminalInput = await screen.findByRole('textbox', {name: 'Terminal input'})
    await expect.element(terminalInput).toHaveFocus()
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
    await expect.element(settings).toHaveFocus()
    expect(screen.queryByRole('tablist', {name: 'Settings sections'})).not.toBeInTheDocument()
  })
})

describe('a toolbar tooltip', () => {
  test('a composer toolbar button shows its TooltipGroup label on hover and on Tab focus, and the label goes away when the member closes while the docked chat stays', async () => {
    const engine = await createEngine()
    await mount({
      engine,
      host: {surface: 'dock'},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest']}),
    })

    const attach = await screen.findByRole('button', {name: 'Add an attachment'})
    await browserUserEvent.hover(attach)
    expect(await screen.findByRole('tooltip', {name: 'Add an attachment'})).toBeVisible()
    await browserUserEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await browserUserEvent.unhover(attach)
    await browserUserEvent.click(screen.getByRole('textbox', {name: 'Message the conciv agent'}))
    await browserUserEvent.tab()
    expect(attach).toHaveFocus()
    expect(await screen.findByRole('tooltip', {name: 'Add an attachment'})).toBeVisible()
    await browserUserEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
    expect(attach).toHaveFocus()
  })
})

describe('notices', () => {
  test('at most three notices stand at once, an error reads as an alert, a dismissed one makes room, and an action runs', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-board']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Board'}))
    const board = await screen.findByRole('tabpanel', {name: 'Board'})
    await user.click(within(board).getByRole('button', {name: 'Raise four notices'}))

    expect(await screen.findByText('Build started')).toBeVisible()
    expect(screen.getByText('Watching the src folder')).toBeVisible()
    expect(screen.getByText('Lint passed')).toBeVisible()
    const failure = await screen.findByRole('alert', {name: 'Deploy failed'})
    expect(within(failure).getByText('Deploy failed')).toBeVisible()
    expect(screen.queryByText('Tests queued')).not.toBeInTheDocument()

    await user.click(within(failure).getByRole('button', {name: 'Dismiss'}))
    expect(await screen.findByText('Tests queued')).toBeVisible()
    expect(screen.queryByText('Deploy failed')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Run tests now'}))
    expect(await within(board).findByText('Tests started')).toBeVisible()
  })
})

describe('phone width', () => {
  test('the panel opens as a sheet with no resize handles and no launcher, and closing brings the launcher back', async () => {
    await page.viewport(375, 800)
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    expect(panel).toBeVisible()
    expect(screen.queryByRole('separator', {name: 'Resize chat height'})).not.toBeInTheDocument()
    expect(screen.queryByRole('separator', {name: 'Resize chat width'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Minimize conciv chat'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Close chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()
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
    expect(details).toHaveFocus()
    expect(screen.queryByText('The board details')).not.toBeInTheDocument()
  })
})

describe('tucking the launcher away', () => {
  test('the user drags the launcher past the left edge into a tab, and the tab brings it back with focus', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    const launcher = await screen.findByRole('button', {name: 'Open conciv chat'})
    await browserUserEvent.pointer([
      {target: launcher, keys: '[MouseLeft>]'},
      {coords: {x: -40, y: 400}},
      {keys: '[/MouseLeft]'},
    ])
    const tab = await screen.findByRole('button', {name: 'Show conciv launcher'})
    expect(tab).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Open conciv chat'})).not.toBeInTheDocument()

    await user.click(tab)
    const restored = await screen.findByRole('button', {name: 'Open conciv chat'})
    expect(restored).toHaveFocus()
    expect(screen.queryByRole('button', {name: 'Show conciv launcher'})).not.toBeInTheDocument()
  })
})

describe('a link to a past harness session', () => {
  test('the address of the harness session id opens that session under its conciv id with its saved thread', async () => {
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-1',
                derivedTitle: 'Fix the login form',
                updatedAt: Date.now() - 86_400_000,
                messages: [{id: 'm1', role: 'user', parts: [{type: 'text', content: 'why does login fail'}]}],
              },
            ],
          },
        ],
      },
    )
    await engine.newSession('Plan the release')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/past-1?open=true']})})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    expect(await screen.findByText('why does login fail')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Plan the release, session options'})).not.toBeInTheDocument()
  })
})

describe('the terminal', () => {
  test('the CLI starts on first open, is locked and interrupted while busy, restarts fresh, and replays after a reload', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const firstInput = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    await expect.element(firstInput).toHaveFocus()
    await browserUserEvent.keyboard('MARK=one; echo "mark:$MARK."{Enter}')
    expect(await screen.findByText('mark:one.')).toBeVisible()

    const newTerminal = screen.getByRole('button', {name: 'New terminal'})
    await browserUserEvent.keyboard("printf '\\e]9;4;1\\a'{Enter}")
    await expect.element(newTerminal).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Select model'})).toBeDisabled()
    await browserUserEvent.keyboard("trap 'echo interrupted' INT; read -rsn1 k{Enter}")
    await browserUserEvent.keyboard('{Escape}')
    expect(await screen.findByText('interrupted')).toBeVisible()
    await browserUserEvent.keyboard('x')
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await browserUserEvent.keyboard("printf '\\e]9;4;0\\a'{Enter}")
    await expect.element(newTerminal).toBeEnabled()
    await user.click(newTerminal)
    await expect.element(firstInput).not.toBeInTheDocument()
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    const secondInput = screen.getByRole('textbox', {name: 'Terminal input'})
    await browserUserEvent.click(secondInput)
    expect(secondInput).toHaveFocus()
    await browserUserEvent.keyboard('echo "mark:$MARK."; echo replay-me{Enter}')
    expect(await screen.findByText('mark:.')).toBeVisible()
    expect(await screen.findByText('replay-me')).toBeVisible()

    cleanup()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect(await screen.findByText('replay-me')).toBeVisible()
    expect(screen.getByText('mark:.')).toBeVisible()
  })

  test('a picked CLI model restarts the pty, is the default for the next session, and stays with the session it was picked in', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const alpha = await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${alpha.id}?open=true`]})})

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select model'}))
    await user.click(await screen.findByRole('option', {name: /^Sonnet 5\.5/}))
    expect(await screen.findByText(/^model sonnet \d+x\d+$/)).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect(await screen.findByText(/^model sonnet \d+x\d+$/)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select model'}))
    await user.click(await screen.findByRole('option', {name: /^Opus 5\.5/}))
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect(await screen.findByText(/^model sonnet \d+x\d+$/)).toBeVisible()
    await browserUserEvent.click(input)
    expect(input).toHaveFocus()
    await browserUserEvent.keyboard('echo "now:$CONCIV_MODEL"{Enter}')
    expect(await screen.findByText('now:sonnet')).toBeVisible()
  })

  test('a press on the terminal toolbar leaves focus in the terminal, and the next keys still reach the CLI', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()
    await expect.element(input).toHaveFocus()

    await user.click(screen.getByRole('toolbar', {name: 'Terminal'}))

    await expect.element(input).toHaveFocus()
    await browserUserEvent.keyboard('echo "still:here"{Enter}')
    expect(await screen.findByText('still:here')).toBeVisible()
  })

  test('a grab picked from the toolbar is pasted into the CLI on Enter, and Back to chat leaves an ended CLI', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect(await screen.findByText(/^model opus \d+x\d+$/)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select an element from the page'}))
    await browserUserEvent.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    await browserUserEvent.click(input)
    expect(input).toHaveFocus()
    await browserUserEvent.keyboard('{Enter}')
    expect(await screen.findByText(/<button id="buy" type="button">Buy the fern/)).toBeVisible()

    await browserUserEvent.keyboard('exit{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Back to chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
  })
})
