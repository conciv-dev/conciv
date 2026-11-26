import {describe, expect} from 'vitest'
import {page, userEvent as browserUserEvent} from 'vitest/browser'
import {cleanup, render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createFakeEngine} from '@conciv/client/testing'
import {test} from '@conciv/backend-test-utils'
import {useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import type {ChatModels} from '@conciv/types/chat-types'
import pageRenderer from '@conciv/plugin-page/renderer'
import {createPageSessionGrouper, pageSessionEntry} from '@conciv/plugin-page/client'
import terminal from '../../src/client.js'

describe('view tabs', () => {
  test('the user switches from the chat to the built-in Terminal tab and back, and hears each switch, and Escape in the terminal leaves the panel open', async () => {
    const user = userEvent.setup()
    const models: ChatModels = {
      models: [{id: 'opus', name: 'Opus 5.5'}],
      defaultModel: 'opus',
      modelsFailed: false,
      harness: {id: 'claude', name: 'Claude Code', imageInput: false, persistentPty: true},
      login: {loggedIn: true},
    }
    const engine = useFakeEngine(
      createFakeEngine({
        models,
        handlers: {
          experimental: {
            persistentPty: {
              create: ({sessionId, size}) => ({
                id: 'pty_0123456789ABCDEFGHJKMNPQRS',
                sessionId,
                size: size ?? {cols: 80, rows: 24},
                busy: false,
              }),
              output: async function* (_input, call) {
                yield {type: 'meta', cursor: 0}
                const signal = call.signal
                if (signal !== undefined)
                  await new Promise((resolve) => signal.addEventListener('abort', resolve, {once: true}))
              },
              resize: () => ({ok: true}),
              write: () => ({ok: true}),
              remove: () => ({ok: true}),
            },
          },
        },
      }),
    )
    await renderTestApp({engine, plugins: [{id: 'terminal', plugin: terminal, builtin: true}]})

    expect(await screen.findByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))

    expect(await screen.findByRole('tab', {name: 'Terminal', selected: true})).toBeVisible()
    expect(await screen.findByRole('tabpanel', {name: 'Terminal'})).toBeVisible()
    const terminalInput = await screen.findByRole('textbox', {name: 'Terminal input'})
    await expect.element(terminalInput).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await expect
      .element(page.getByRole('status', {name: 'conciv announcements', exact: true}))
      .toHaveTextContent('Terminal')
    expect(screen.queryByRole('textbox', {name: 'Message the conciv agent'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: 'Chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
    await expect
      .element(page.getByRole('status', {name: 'conciv announcements', exact: true}))
      .toHaveTextContent('Chat')
    expect(screen.queryByRole('tabpanel', {name: 'Terminal'})).not.toBeInTheDocument()
  })
})

describe('the terminal', () => {
  test('the CLI starts on first open, is locked and interrupted while busy, restarts fresh, and replays after a reload', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await renderTestApp({
      engine,
      plugins: [{id: 'terminal', plugin: terminal, builtin: true}],
      initialEntries: ['/panel/latest?open=true'],
    })

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const firstInput = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    await expect.element(firstInput).toHaveFocus()
    await browserUserEvent.keyboard('MARK=one; echo "mark:$MARK."{Enter}')
    expect((await screen.findAllByText('mark:one.')).at(-1)).toBeVisible()

    const newTerminal = screen.getByRole('button', {name: 'New terminal'})
    await browserUserEvent.keyboard("printf '\\e]9;4;1\\a'{Enter}")
    await expect.element(newTerminal).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Select model'})).toBeDisabled()
    await browserUserEvent.keyboard("trap 'echo interrupted' INT; read -rsn1 k{Enter}")
    await browserUserEvent.keyboard('{Escape}')
    expect((await screen.findAllByText('interrupted')).at(-1)).toBeVisible()
    await browserUserEvent.keyboard('x')
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await browserUserEvent.keyboard("printf '\\e]9;4;0\\a'{Enter}")
    await expect.element(newTerminal).toBeEnabled()
    await user.click(newTerminal)
    await expect.element(firstInput).not.toBeInTheDocument()
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()
    expect((await screen.findAllByText(/^[^\s$]+\$$/)).at(-1)).toBeVisible()
    const secondInput = screen.getByRole('textbox', {name: 'Terminal input'})
    await browserUserEvent.click(secondInput)
    expect(secondInput).toHaveFocus()
    await browserUserEvent.keyboard('echo "mark:$MARK."; echo replay-me{Enter}')
    expect((await screen.findAllByText('mark:.')).at(-1)).toBeVisible()
    expect((await screen.findAllByText('replay-me')).at(-1)).toBeVisible()

    cleanup()
    await renderTestApp({
      engine,
      plugins: [{id: 'terminal', plugin: terminal, builtin: true}],
      initialEntries: ['/panel/latest?open=true'],
    })
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect((await screen.findAllByText('replay-me')).at(-1)).toBeVisible()
    expect(screen.getAllByText('mark:.').at(-1)).toBeVisible()
  })

  test('a picked CLI model restarts the pty, is the default for the next session, and stays with the session it was picked in', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const alpha = await engine.newSession('Alpha')
    await engine.newSession('Beta')
    await renderTestApp({
      engine,
      plugins: [{id: 'terminal', plugin: terminal, builtin: true}],
      initialEntries: [`/panel/${alpha.id}?open=true`],
    })

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select model'}))
    await user.click(await screen.findByRole('option', {name: /^Sonnet 5\.5/}))
    expect((await screen.findAllByText(/^model sonnet \d+x\d+$/)).at(-1)).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    expect((await screen.findAllByText(/^model sonnet \d+x\d+$/)).at(-1)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select model'}))
    await user.click(await screen.findByRole('option', {name: /^Opus 5\.5/}))
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect((await screen.findAllByText(/^model sonnet \d+x\d+$/)).at(-1)).toBeVisible()
    await browserUserEvent.click(input)
    expect(input).toHaveFocus()
    await browserUserEvent.keyboard('echo "now:$CONCIV_MODEL"{Enter}')
    expect((await screen.findAllByText('now:sonnet')).at(-1)).toBeVisible()
  })

  test('a press on the terminal toolbar leaves focus in the terminal, and the next keys still reach the CLI', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await renderTestApp({
      engine,
      plugins: [{id: 'terminal', plugin: terminal, builtin: true}],
      initialEntries: ['/panel/latest?open=true'],
    })

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()
    await expect.element(input).toHaveFocus()

    await user.click(screen.getByRole('toolbar', {name: 'Terminal'}))

    await expect.element(input).toHaveFocus()
    await browserUserEvent.keyboard('echo "still:here"{Enter}')
    expect((await screen.findAllByText('still:here')).at(-1)).toBeVisible()
  })

  test('a grab picked from the toolbar is held as a chip, pasted into the CLI on Enter and never sent to the chat, and Back to chat leaves an ended CLI', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine({}, {plugins: ['@conciv/plugin-page']})
    const control = await engine.event('rpc.experimental.page.control')
    await renderTestApp({
      engine,
      plugins: [
        {id: 'terminal', plugin: terminal, builtin: true},
        {
          id: 'conciv.page',
          plugin: pageRenderer,
          builtin: true,
          engineHalf: true,
          toolGroup: {entry: pageSessionEntry, createGrouper: createPageSessionGrouper},
        },
      ],
      initialEntries: ['/panel/latest?open=true'],
    })
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))
    const input = await screen.findByRole('textbox', {name: 'Terminal input'})
    expect((await screen.findAllByText(/^model opus \d+x\d+$/)).at(-1)).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Select an element from the page'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await browserUserEvent.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const toolbar = screen.getByRole('toolbar', {name: 'Terminal'})
    expect(await within(toolbar).findByRole('button', {name: 'Remove button'})).toBeVisible()
    await browserUserEvent.click(input)
    expect(input).toHaveFocus()
    await browserUserEvent.keyboard('{Enter}')
    expect((await screen.findAllByText(/<button id="buy">Buy the fern<\/button>/)).at(-1)).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Remove button'})).not.toBeInTheDocument()

    await browserUserEvent.keyboard('exit{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Back to chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
    expect(screen.queryByRole('list', {name: 'Notes'})).not.toBeInTheDocument()
  })
})
