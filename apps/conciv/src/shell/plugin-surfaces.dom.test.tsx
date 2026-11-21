import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('view tabs', () => {
  test('the user switches from the chat to the built-in Terminal tab and back, and hears each switch', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
    await user.click(await screen.findByRole('tab', {name: 'Terminal'}))

    expect(await screen.findByRole('tab', {name: 'Terminal', selected: true})).toBeVisible()
    expect(await screen.findByRole('tabpanel', {name: 'Terminal'})).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Terminal')
    expect(screen.queryByRole('textbox', {name: 'Message the conciv agent'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: 'Chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Chat', selected: true})).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Chat')
    expect(screen.queryByRole('tabpanel', {name: 'Terminal'})).not.toBeInTheDocument()
  })
})

describe('a plugin tab, its dialogs and its overlay', () => {
  test('a plugin tab that crashes comes back on Retry, its dialogs answer, and its overlay hides the panel until it closes', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-surfaces']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Desk'}))
    expect(await screen.findByText('The shell-surfaces plugin crashed')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Retry'}))
    const desk = await screen.findByRole('tabpanel', {name: 'Desk'})
    expect(within(desk).getByRole('button', {name: 'Publish'})).toBeVisible()

    await user.click(within(desk).getByRole('button', {name: 'Publish'}))
    const confirm = await screen.findByRole('dialog', {name: 'Publish the notes?'})
    await user.click(within(confirm).getByRole('button', {name: 'Publish now'}))
    expect(await within(desk).findByText('Publish confirmed: true')).toBeVisible()

    await user.click(within(desk).getByRole('button', {name: 'Save'}))
    const notice = await screen.findByRole('dialog', {name: 'Notes saved'})
    await user.click(within(notice).getByRole('button', {name: 'OK'}))
    expect(await within(desk).findByText('The save notice was closed')).toBeVisible()

    await user.click(within(desk).getByRole('button', {name: 'Rename'}))
    const naming = await screen.findByRole('dialog', {name: 'Name the notes'})
    expect(within(naming).getByRole('button', {name: 'Submit'})).toBeDisabled()
    await user.type(within(naming).getByRole('textbox', {name: 'Name the notes'}), 'Launch plan')
    await user.click(within(naming).getByRole('button', {name: 'Submit'}))
    expect(await within(desk).findByText('Named Launch plan')).toBeVisible()

    await user.click(within(desk).getByRole('button', {name: 'Colour'}))
    const picker = await screen.findByRole('dialog', {name: 'Pick a colour'})
    await user.type(within(picker).getByRole('textbox', {name: 'Pick a colour'}), 'tl')
    expect(await within(picker).findByRole('option', {name: 'Teal'})).toBeVisible()
    expect(within(picker).queryByRole('option', {name: 'Crimson'})).not.toBeInTheDocument()
    await user.click(within(picker).getByRole('option', {name: 'Teal'}))
    expect(await within(desk).findByText('Picked teal')).toBeVisible()

    await user.click(within(desk).getByRole('button', {name: 'Cover the page'}))
    const uncover = await screen.findByRole('button', {name: 'Uncover the page'})
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
    await user.click(uncover)
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })
})
