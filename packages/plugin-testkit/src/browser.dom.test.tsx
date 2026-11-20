import {describe, expect} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type {Platform} from '@conciv/app'
import {compose} from '@conciv/plugin/experimental/host'
import {Panel, type Plugin} from '@conciv/plugin/experimental'
import {declareExpectedLog} from '@conciv/vitest-config/expected-log'
import {test} from './browser.js'

type ComposedPlugin = NonNullable<Platform['plugins']>[number]

const NOTES_BODY = 'the notes tab body'

const notes: Plugin.Setup = (ctx) => {
  ctx.add(Panel, {
    id: 'notes',
    region: 'pane',
    list: () => [{id: 'notes', title: 'Notes', pinned: true}],
    render: () => Object.assign(document.createElement('p'), {textContent: NOTES_BODY}),
  })
}

const plugins = compose({notes: {windowEntry: async () => ({default: notes})}}).map((entry): ComposedPlugin => [
  entry,
  {},
])

describe('the app on happy-dom', () => {
  test('a user sends a message, sees the reply, waits out a held run and opens a plugin tab', async ({
    mount,
    chat,
    task,
  }) => {
    declareExpectedLog(task, /^console\.error: \[conciv\] drafts stay engine-only indexedDB is not defined$/)
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
    await user.click(await screen.findByRole('tab', {name: 'Notes'}))
    expect(await screen.findByText(NOTES_BODY)).toBeInTheDocument()
  })
})
