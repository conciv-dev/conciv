import {describe, expect, it, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent, {type UserEvent} from '@testing-library/user-event'
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
  test('a plugin tab that crashes says so and comes back on Retry', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [['./test/fixtures/plugins/shell-board', {crash: true}]]})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Desk'}))
    expect(await screen.findByText('The shell-board plugin crashed')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Retry'}))
    const desk = await screen.findByRole('tabpanel', {name: 'Desk'})
    expect(within(desk).getByRole('button', {name: 'Publish'})).toBeVisible()
  })

  it.each([
    {
      opens: 'Publish',
      dialog: 'Publish the notes?',
      answer: async (user: UserEvent, dialog: HTMLElement) => {
        await user.click(within(dialog).getByRole('button', {name: 'Publish now'}))
      },
      shown: 'Publish confirmed: true',
    },
    {
      opens: 'Save',
      dialog: 'Notes saved',
      answer: async (user: UserEvent, dialog: HTMLElement) => {
        await user.click(within(dialog).getByRole('button', {name: 'OK'}))
      },
      shown: 'The save notice was closed',
    },
    {
      opens: 'Rename',
      dialog: 'Name the notes',
      answer: async (user: UserEvent, dialog: HTMLElement) => {
        expect(within(dialog).getByRole('button', {name: 'Submit'})).toBeDisabled()
        await user.type(within(dialog).getByRole('textbox', {name: 'Name the notes'}), 'Launch plan')
        await user.click(within(dialog).getByRole('button', {name: 'Submit'}))
      },
      shown: 'Named Launch plan',
    },
    {
      opens: 'Colour',
      dialog: 'Pick a colour',
      answer: async (user: UserEvent, dialog: HTMLElement) => {
        await user.type(within(dialog).getByRole('textbox', {name: 'Pick a colour'}), 'tl')
        expect(await within(dialog).findByRole('option', {name: 'Teal'})).toBeVisible()
        expect(within(dialog).queryByRole('option', {name: 'Crimson'})).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('option', {name: 'Teal'}))
      },
      shown: 'Picked teal',
    },
  ])(
    'the plugin button $opens opens the $dialog dialog and the tab gets its answer',
    async ({opens, dialog, answer, shown}) => {
      const user = userEvent.setup()
      const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-board']})
      await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
      await user.click(await screen.findByRole('tab', {name: 'Desk'}))
      const desk = await screen.findByRole('tabpanel', {name: 'Desk'})

      await user.click(within(desk).getByRole('button', {name: opens}))
      await answer(user, await screen.findByRole('dialog', {name: dialog}))
      expect(await within(desk).findByText(shown)).toBeVisible()
    },
  )

  test('a plugin overlay hides the panel until the user closes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/shell-board']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('tab', {name: 'Desk'}))
    const desk = await screen.findByRole('tabpanel', {name: 'Desk'})

    await user.click(within(desk).getByRole('button', {name: 'Cover the page'}))
    const uncover = await screen.findByRole('button', {name: 'Uncover the page'})
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
    await user.click(uncover)
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })
})
