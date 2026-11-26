import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createFakeEngine} from '@conciv/client/testing'
import {useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import type {ChatModels} from '@conciv/types/chat-types'
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
