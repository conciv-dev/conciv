import {describe, expect} from 'vitest'
import {screen, waitFor} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type {Platform} from '@conciv/app'
import {compose} from '@conciv/plugin/experimental/host'
import {Panel, type Plugin} from '@conciv/plugin/experimental'
import {test} from './browser.js'

type ComposedPlugin = NonNullable<Platform['plugins']>[number]

const NOTES_BODY = 'the notes tab body'
const DRAFTS_WITHOUT_INDEXED_DB = /^console\.error: \[conciv\] drafts stay engine-only indexedDB is not defined$/
const PAST_THE_QUOTA = 'x'.repeat(11_000_000)

function notesPanel(confirm: () => void): HTMLElement {
  const body = Object.assign(document.createElement('p'), {textContent: NOTES_BODY})
  const end = Object.assign(document.createElement('button'), {type: 'button', textContent: 'End the notes'})
  end.addEventListener('click', confirm)
  const panel = document.createElement('div')
  panel.append(body, end)
  return panel
}

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
  test('a user sends a message, sees the reply, waits out a held run, pastes a file and opens a plugin tab and its dialog', async ({
    mount,
    chat,
    expectLog,
  }) => {
    expectLog(DRAFTS_WITHOUT_INDEXED_DB)
    const user = userEvent.setup()
    await mount({plugins})
    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
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
  })
})

describe('the happy-dom environment', () => {
  test('a write past the storage quota throws the browser quota error', async ({mount, expectLog}) => {
    expectLog(DRAFTS_WITHOUT_INDEXED_DB)
    await mount()
    localStorage.setItem('conciv-test-left-behind', 'a value')
    expect(() => localStorage.setItem('conciv-test-fill', PAST_THE_QUOTA)).toThrow(
      expect.objectContaining({name: 'QuotaExceededError'}),
    )
  })

  test('the next test starts with empty storage', () => {
    expect(localStorage.getItem('conciv-test-left-behind')).toBeNull()
  })
})
