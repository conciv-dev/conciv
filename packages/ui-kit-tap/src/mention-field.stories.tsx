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
      <output aria-label="Sent" class="text-[0.6875rem] text-chat-text-3">
        {JSON.stringify(sent())}
      </output>
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

export const MentionOptionsCarryAvatars: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await userEvent.type(editor, '@')
    await waitFor(() => {
      expect(within(canvas.getByRole('option', {name: 'Opus'})).getByText('O')).toBeVisible()
      expect(within(canvas.getByRole('option', {name: 'You'})).getByText('Y')).toBeVisible()
    })
  },
}

export const MentionScreenReaderSurface: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await expect(editor).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(editor, '@')
    const listbox = await waitFor(() => canvas.getByRole('listbox', {name: 'Mention a participant'}))
    await expect(editor).toHaveAttribute('aria-haspopup', 'listbox')
    await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'true'))
    await expect(editor.getAttribute('aria-controls')).toBe(listbox.id)
    await waitFor(() =>
      expect(editor.getAttribute('aria-activedescendant')).toBe(canvas.getByRole('option', {name: 'You'}).id),
    )
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(editor.getAttribute('aria-activedescendant')).toBe(canvas.getByRole('option', {name: 'Opus'}).id),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).not.toBeInTheDocument())
    await expect(editor).toHaveAttribute('aria-expanded', 'false')
    await expect(editor).not.toHaveAttribute('aria-activedescendant')
  },
}

export const MentionTabCommitsTheHighlightedOption: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @Op')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Opus'})).toBeVisible())
    await userEvent.keyboard('{Tab}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).not.toBeInTheDocument())
    await waitFor(() => expect(within(editor).getByText('@Opus')).toBeVisible())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      const sent = JSON.parse(canvas.getByRole('status', {name: 'Sent'}).textContent ?? 'null')
      expect(sent).toEqual([
        {type: 'text', text: 'hi '},
        {type: 'mention', id: 'ai:Opus', label: 'Opus'},
        {type: 'text', text: ' '},
      ])
    })
  },
}

export const MentionCancelledClickKeepsEditorFocused: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await userEvent.type(editor, '@')
    const option = await waitFor(() => canvas.getByRole('option', {name: 'You'}))
    await userEvent.pointer([{keys: '[MouseLeft>]', target: option}, {target: editor}, {keys: '[/MouseLeft]'}])
    await waitFor(() => expect(editor).toHaveFocus())
    await userEvent.type(editor, 'hello')
    await waitFor(() => expect(within(editor).getByText('@hello')).toBeVisible())
  },
}

export const MentionEnterSubmitsWhenNothingMatches: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => canvas.getByRole('textbox', {name: 'Comment'}))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hey @zzz')
    await waitFor(() => expect(canvas.getByText('No matches')).toBeVisible())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      const sent = JSON.parse(canvas.getByRole('status', {name: 'Sent'}).textContent ?? 'null')
      expect(sent).toEqual([{type: 'text', text: 'hey @zzz'}])
    })
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
    await waitFor(() => expect(option).toBeVisible())
    await userEvent.click(option)

    await waitFor(() => expect(canvas.getByText('@Opus')).toBeVisible())
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      const sent = JSON.parse(canvas.getByRole('status', {name: 'Sent'}).textContent ?? 'null')
      expect(sent).toEqual([
        {type: 'text', text: 'hi '},
        {type: 'mention', id: 'ai:Opus', label: 'Opus'},
        {type: 'text', text: ' '},
      ])
    })
  },
}
