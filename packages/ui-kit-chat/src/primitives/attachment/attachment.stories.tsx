import {createSignal, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerProvider, type AttachmentDraft} from '../composer/composer-context.js'
import {Attachment, AttachmentProvider} from './attachment.js'

const meta: Meta = {title: 'primitives/Attachment'}
export default meta
type Story = StoryObj

const SEED: AttachmentDraft[] = [
  {id: 'a', name: 'diagram.png', part: {type: 'image', source: {type: 'data', value: '', mimeType: 'image/png'}}},
  {
    id: 'b',
    name: 'notes.pdf',
    part: {type: 'document', source: {type: 'data', value: '', mimeType: 'application/pdf'}},
  },
]

function Harness(): JSX.Element {
  const [attachments, setAttachments] = createSignal<AttachmentDraft[]>(SEED)
  return (
    <ComposerProvider
      value={{
        attachments,
        addAttachment: (draft) => setAttachments((prev) => [...prev, draft]),
        removeAttachment: (id) => setAttachments((prev) => prev.filter((draft) => draft.id !== id)),
        quote: () => null,
        setQuote: () => {},
        editing: () => false,
        setEditing: () => {},
        dictating: () => false,
        setDictating: () => {},
      }}
    >
      <div class="flex gap-2">
        <For each={attachments()}>
          {(draft) => (
            <AttachmentProvider value={draft}>
              <Attachment.Root class="px-2 py-1 border border-pw-line rounded-pw-sm flex gap-1 items-center">
                <Attachment.Thumb class="text-[0.625rem] text-pw-text-3" />
                <Attachment.Name class="text-[0.75rem] text-pw-text-2" />
                <Attachment.Remove class="text-pw-text-3" aria-label={`Remove ${draft.name}`}>
                  ×
                </Attachment.Remove>
              </Attachment.Root>
            </AttachmentProvider>
          )}
        </For>
      </div>
    </ComposerProvider>
  )
}

export const Chips: Story = {
  render: () => <Harness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('diagram.png')).toBeVisible()
    await expect(c.getByText('PNG')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: 'Remove diagram.png'}))
    await waitFor(() => expect(c.queryByText('diagram.png')).toBeNull())
    await expect(c.getByText('notes.pdf')).toBeVisible()
  },
}
