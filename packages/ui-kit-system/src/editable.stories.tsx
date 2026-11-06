import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Pencil from 'lucide-solid/icons/pencil'
import {Editable} from './editable.js'

const meta: Meta = {title: 'ui-kit-system/Editable'}
export default meta
type Story = StoryObj

const TRIGGER =
  'inline-flex items-center justify-center size-7 rounded-chat-surface-md bg-transparent [border:none] text-chat-text-2 cursor-pointer hover:bg-chat-fill-strong focus-ring'

function Demo() {
  return (
    <Editable.Root
      class="text-[0.875rem] text-chat-text-hi font-chat flex gap-1 w-60 items-center"
      defaultValue="Session title"
      activationMode="none"
      translations={{edit: 'Rename', input: 'Title'}}
    >
      <Editable.Area class="flex-1">
        <Editable.Input />
        <Editable.Preview class="truncate" />
      </Editable.Area>
      <Editable.EditTrigger class={TRIGGER}>
        <Pencil class="size-3.5 block" aria-hidden="true" />
      </Editable.EditTrigger>
    </Editable.Root>
  )
}

export const Default: Story = {
  render: () => <Demo />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: 'Rename'}))
    const input = c.getByRole('textbox', {name: 'Title'})
    await waitFor(() => expect(input).toHaveFocus())
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed{Enter}')
    await waitFor(() => expect(c.getByText('Renamed')).toBeVisible())
    await waitFor(() => expect(c.getByRole('button', {name: 'Rename'})).toHaveFocus())
  },
}

export const EscapeCancels: Story = {
  render: () => <Demo />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: 'Rename'}))
    const input = c.getByRole('textbox', {name: 'Title'})
    await waitFor(() => expect(input).toHaveFocus())
    await userEvent.type(input, ' discarded{Escape}')
    await waitFor(() => expect(c.getByText('Session title')).toBeVisible())
  },
}
