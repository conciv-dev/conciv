import {createSignal, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerProvider} from '../composer/composer-context.js'
import type {CompleteAttachment} from './attachment-adapter.js'
import {Attachment, AttachmentProvider} from './attachment.js'

const meta: Meta = {title: 'primitives/Attachment'}
export default meta
type Story = StoryObj

const SEED: CompleteAttachment[] = [
  {
    id: 'a',
    type: 'image',
    name: 'diagram.png',
    content: [{type: 'image', source: {type: 'data', value: '', mimeType: 'image/png'}}],
    status: {type: 'complete'},
  },
  {
    id: 'b',
    type: 'document',
    name: 'notes.pdf',
    content: [{type: 'document', source: {type: 'data', value: '', mimeType: 'application/pdf'}}],
    status: {type: 'complete'},
  },
]

function Harness(): JSX.Element {
  const [attachments, setAttachments] = createSignal<CompleteAttachment[]>(SEED)
  return (
    <ComposerProvider
      value={{
        attachments,
        attachmentAdapter: () => undefined,
        addAttachment: async () => {},
        removeAttachment: async (id) => {
          setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
        },
        sendingAttachments: () => false,
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
