import {describe, expect} from 'vitest'
import {screen, waitFor, waitForElementToBeRemoved} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type {Platform} from '@conciv/app'
import {compose} from '@conciv/plugin/experimental/host'
import {Panel, type Plugin} from '@conciv/plugin/experimental'
import {test} from './browser.js'

type ComposedPlugin = NonNullable<Platform['plugins']>[number]

const NOTES_BODY = 'the notes tab body'
const PAST_THE_QUOTA = 'x'.repeat(11_000_000)

function notesPanel(confirm: () => void): HTMLElement {
  const body = Object.assign(document.createElement('p'), {textContent: NOTES_BODY})
  const end = Object.assign(document.createElement('button'), {type: 'button', textContent: 'End the notes'})
  end.addEventListener('click', confirm)
  const panel = document.createElement('div')
  panel.append(body, end)
  return panel
}

const FAILED_TURN_MESSAGE = 'Internal Server Error'

const notes: Plugin.Setup = (ctx) => {
  ctx.add(Panel, {
    id: 'notes',
    region: 'pane',
    list: () => [{id: 'notes', title: 'Notes', pinned: true}],
    render: () =>
      notesPanel(() => {
        void ctx.dialogs.confirm({title: 'End the notes?', confirm: 'End'})
      }),
  })
}

const plugins = compose({notes: {windowEntry: async () => ({default: notes})}}).map((entry): ComposedPlugin => [
  entry,
  {},
])

describe('the app on happy-dom', () => {
  test('a user sends a message, sees the reply, waits out a held run, pastes a file, opens a plugin tab and its dialog and minimizes the chat', async ({
    mount,
    chat,
  }) => {
    const user = userEvent.setup()
    await mount({plugins})
    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    const composer = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await chat.reply('the scripted reply')
    await user.type(composer, 'hello{Enter}')
    expect(await screen.findByText('hello')).toBeInTheDocument()
    expect(await screen.findByText('the scripted reply')).toBeInTheDocument()
    await chat.hold()
    await user.type(composer, 'a held run{Enter}')
    expect(await screen.findByText('a held run')).toBeInTheDocument()
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeInTheDocument()
    await chat.release()
    expect(await screen.findByText('Hello from conciv')).toBeInTheDocument()
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['a note'], 'notes.txt', {type: 'text/plain'}))
    await user.click(composer)
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: 'Remove notes.txt'})).toBeInTheDocument()
    await user.click(await screen.findByRole('tab', {name: 'Notes'}))
    expect(await screen.findByText(NOTES_BODY)).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'End the notes'}))
    const dialog = await screen.findByRole('dialog', {name: 'End the notes?'})
    await waitFor(() => expect(screen.getByRole('button', {name: 'End'})).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', {name: 'Minimize conciv chat'}))
    await waitFor(() => expect(panel).not.toBeVisible())
    expect(panel).toBeInTheDocument()
  })
})

describe('the happy-dom environment', () => {
  test('a write past the storage quota throws the browser quota error', async ({mount}) => {
    await mount()
    localStorage.setItem('conciv-test-left-behind', 'a value')
    expect(() => localStorage.setItem('conciv-test-fill', PAST_THE_QUOTA)).toThrow(
      expect.objectContaining({name: 'QuotaExceededError'}),
    )
  })

  test('the next test starts with empty storage', () => {
    expect(localStorage.getItem('conciv-test-left-behind')).toBeNull()
  })

  test('a canceled animation leaves nothing unhandled, and a caller awaiting finished still sees the abort', async () => {
    document.body.animate([{opacity: 0}, {opacity: 1}], 1000).cancel()
    const watched = document.body.animate([{opacity: 0}, {opacity: 1}], 1000)
    const outcome = watched.finished.then(
      () => 'finished',
      (error: unknown) => (error instanceof Error ? error.name : 'not an error'),
    )
    watched.cancel()
    expect(await outcome).toBe('AbortError')
  })

  test('a test that ends with the engine paused still tears down, whatever order it lists faults and mount in', async ({
    faults,
    chat,
    mount,
  }) => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    await chat.reply('a reply before the pause')
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'hello{Enter}')
    expect(await screen.findByText('a reply before the pause')).toBeInTheDocument()
    await faults.pause()
  })
})

describe('the app on happy-dom behind the kit engine proxy', () => {
  test('a send passes the proxy, the socket drops and returns, a paused reply lands on resume and a failed turn shows its error', async ({
    mount,
    chat,
    faults,
  }) => {
    const user = userEvent.setup()
    await mount()
    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    const composer = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await chat.reply('the first reply')
    await user.type(composer, 'through the proxy{Enter}')
    expect(await screen.findByText('the first reply')).toBeInTheDocument()
    await faults.offline()
    expect(await screen.findByText('conciv lost connection to the engine.')).toBeInTheDocument()
    await faults.online()
    await waitForElementToBeRemoved(() => screen.queryByText('conciv lost connection to the engine.'))
    await chat.reply('the reply after the drop')
    await user.type(composer, 'after the drop{Enter}')
    expect(await screen.findByText('the reply after the drop')).toBeInTheDocument()
    await faults.pause()
    await chat.reply('the paused reply')
    await user.type(composer, 'while paused{Enter}')
    expect(await screen.findByText('while paused')).toBeInTheDocument()
    expect(screen.queryByText('the paused reply')).not.toBeInTheDocument()
    await faults.resume()
    expect(await screen.findByText('the paused reply')).toBeInTheDocument()
    await faults.failChatTurns()
    await user.type(composer, 'a failed turn{Enter}')
    expect(await screen.findByText(FAILED_TURN_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Retry'})).toBeInTheDocument()
  })
})
