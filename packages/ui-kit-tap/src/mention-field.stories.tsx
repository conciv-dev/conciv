import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {MentionField, type MentionItem, type MentionSegment} from './mention-field.js'

const PARTICIPANTS: MentionItem[] = [
  {id: 'dev', label: 'You'},
  {id: 'ai:Opus', label: 'Opus'},
  {id: 'ai:Sonnet', label: 'Sonnet'},
]

const filter = (query: string): MentionItem[] =>
  PARTICIPANTS.filter((participant) => participant.label.toLowerCase().includes(query.toLowerCase()))

function Harness(props: {placeholder?: string}) {
  const [sent, setSent] = createSignal<MentionSegment[] | null>(null)
  return (
    <div class="flex flex-col gap-3">
      <MentionField items={filter} onSubmit={setSent} placeholder={props.placeholder} ariaLabel="Comment" />
      <pre data-testid="sent" class="text-[0.6875rem] text-pw-text-3">
        {JSON.stringify(sent())}
      </pre>
    </div>
  )
}

const meta: Meta<typeof Harness> = {title: 'ui-kit-tap/MentionField', component: Harness}
export default meta
type Story = StoryObj<typeof Harness>

export const Empty: Story = {
  args: {placeholder: 'Reply, @mention someone…'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('textbox', {name: 'Comment'})).toBeInTheDocument())
    await expect(canvas.getByText('Reply, @mention someone…')).toBeVisible()
  },
}

export const MentionFlow: Story = {
  args: {placeholder: 'Reply, @mention someone…'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @Op')

    const option = await waitFor(() => canvas.getByRole('option', {name: /Opus/}))
    await expect(option).toBeVisible()
    await userEvent.click(option)

    await waitFor(() => expect(canvas.getByText('@Opus')).toBeVisible())
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      const sent = JSON.parse(canvas.getByTestId('sent').textContent ?? 'null')
      expect(sent).toEqual([
        {type: 'text', text: 'hi '},
        {type: 'mention', id: 'ai:Opus', label: 'Opus'},
        {type: 'text', text: ' '},
      ])
    })
  },
}
