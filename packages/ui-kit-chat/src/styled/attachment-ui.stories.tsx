import {createSignal, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerProvider, type AttachmentDraft} from '../primitives/composer/composer-context.js'
import {AttachmentProvider} from '../primitives/attachment/attachment.js'
import {SAMPLE_IMAGE_BASE64, SAMPLE_IMAGE_MIME} from '../store/sample-image.fixtures.js'
import {AttachmentUI} from './attachment-ui.js'

const meta: Meta = {title: 'styled/AttachmentUI'}
export default meta
type Story = StoryObj

const SEED: AttachmentDraft[] = [
  {
    id: 'a',
    name: 'diagram.png',
    part: {type: 'image', source: {type: 'data', value: SAMPLE_IMAGE_BASE64, mimeType: SAMPLE_IMAGE_MIME}},
  },
  {
    id: 'b',
    name: 'notes.pdf',
    part: {type: 'document', source: {type: 'data', value: '', mimeType: 'application/pdf'}},
  },
]

function Frame(): JSX.Element {
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
      <div class="p-3 flex gap-2 [background:var(--chat-bg)]">
        <For each={attachments()}>
          {(draft) => (
            <AttachmentProvider value={draft}>
              <AttachmentUI removable />
            </AttachmentProvider>
          )}
        </For>
      </div>
    </ComposerProvider>
  )
}

export const ImageAndFileTiles: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByRole('img', {name: 'diagram.png'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Remove diagram.png'})).toBeInTheDocument()

    await userEvent.click(c.getByRole('button', {name: 'Remove diagram.png'}))
    await waitFor(() => expect(c.queryByRole('img', {name: 'diagram.png'})).toBeNull())
    await expect(c.getByRole('button', {name: 'Remove notes.pdf'})).toBeInTheDocument()
  },
}
