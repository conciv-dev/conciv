import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Collapsible} from './collapsible.js'

const meta: Meta<typeof Collapsible.Root> = {title: 'ui-kit-system/Collapsible', component: Collapsible.Root}
export default meta
type Story = StoryObj<typeof Collapsible.Root>

const TRIGGER =
  'flex items-center justify-between gap-2 w-full bg-chat-fill border border-chat-line rounded-chat-surface-md py-2 px-3 text-chat-text font-chat cursor-pointer'
const BODY = 'mt-1.75 py-2 px-3 text-chat-text-2 bg-chat-sunken rounded-chat-surface-sm'

function Demo(props: {defaultOpen?: boolean}) {
  return (
    <Collapsible.Root defaultOpen={props.defaultOpen}>
      <Collapsible.Trigger class={TRIGGER}>
        Tool details
        <Collapsible.Indicator class="text-chat-text-3 [&[data-state=open]]:[transform:rotate(180deg)]">
          ▾
        </Collapsible.Indicator>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class={BODY}>Hidden content that slides open and closed with the shared kit animation.</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export const Default: Story = {
  render: () => <Demo />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByRole('button', {name: /Tool details/})
    await expect(trigger).toBeVisible()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText(/Hidden content/)).toBeVisible())
  },
}

export const InitiallyOpen: Story = {
  render: () => <Demo defaultOpen />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Hidden content/)).toBeVisible()
  },
}
