import {createSignal, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerProvider} from '../primitives/composer/composer-context.js'
import type {CompleteAttachment} from '../primitives/attachment/attachment-adapter.js'
import {AttachmentProvider} from '../primitives/attachment/attachment.js'
import {SAMPLE_IMAGE_BASE64, SAMPLE_IMAGE_MIME} from '../store/sample-image.fixtures.js'
import {AttachmentUI} from './attachment-ui.js'

const meta: Meta = {title: 'ui-kit-chat/styled/AttachmentUI'}
export default meta
type Story = StoryObj

const SEED: CompleteAttachment[] = [
  {
    id: 'a',
    type: 'image',
    name: 'diagram.png',
    content: [{type: 'image', source: {type: 'data', value: SAMPLE_IMAGE_BASE64, mimeType: SAMPLE_IMAGE_MIME}}],
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

function Frame(): JSX.Element {
  const [attachments, setAttachments] = createSignal<CompleteAttachment[]>(SEED)
  const remove = (id: string): void => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }
  return (
    <ComposerProvider
      value={{
        attachments,
        attachmentAdapter: () => undefined,
        addAttachment: async () => null,
        hasAttachment: () => false,
        replaceAttachment: async () => null,
        removeAttachment: async (id) => remove(id),
        sendingAttachments: () => false,
        snapshotDraft: () => ({draft: '', attachments: [], quote: null, items: []}),
        restoreDraft: () => {},
        clearDraft: () => {},
        quote: () => null,
        setQuote: () => {},
        items: () => [],
        staged: () => attachments().length,
        addItem: () => {},
        removeItem: () => {},
        updateItem: () => {},
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
              <AttachmentUI onRemove={remove} />
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
    const page = within(canvasElement.ownerDocument.body)

    await waitFor(() => expect(c.getByRole('img', {name: 'diagram.png'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Remove diagram.png'})).toBeInTheDocument()

    await userEvent.tab()
    await userEvent.tab()
    await waitFor(() => expect(c.getByRole('button', {name: 'Remove diagram.png'})).toHaveFocus())
    expect(c.getByRole('button', {name: 'Remove diagram.png'}).matches(':focus-visible')).toBe(true)
    await waitFor(() => expect(c.getByRole('button', {name: 'Remove diagram.png'})).toBeVisible())

    await userEvent.click(c.getByRole('button', {name: 'Open diagram.png'}))
    const viewer = await page.findByRole('dialog', {name: 'diagram.png'})
    await expect(within(viewer).getByRole('button', {name: 'Show actual size'})).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog', {name: 'diagram.png'})).toBeNull())
    await waitFor(() => expect(c.getByRole('button', {name: 'Open diagram.png'})).toHaveFocus())

    await userEvent.click(c.getByRole('button', {name: 'notes.pdf'}))
    await expect(page.queryByRole('dialog')).toBeNull()

    await userEvent.click(c.getByRole('button', {name: 'Remove diagram.png'}))
    await waitFor(() => expect(c.queryByRole('img', {name: 'diagram.png'})).toBeNull())
    await expect(c.getByRole('button', {name: 'Remove notes.pdf'})).toBeInTheDocument()
  },
}

export const Tiles: Story = {
  render: () => <Frame />,
}
