import {createSignal, For, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ComposerProvider} from '../primitives/composer/composer-context.js'
import type {CompleteAttachment} from '../primitives/attachment/attachment-adapter.js'
import {AttachmentProvider, useAttachment} from '../primitives/attachment/attachment.js'
import {AttachmentByMime, type AttachmentCardProps} from './attachment-dispatch.js'
import {CornerRemoveButton} from './corner-remove-button.js'

const meta: Meta = {title: 'ui-kit-chat/styled/AttachmentByMime'}
export default meta
type Story = StoryObj

const RECORDING_MIME = 'application/x-fake-recording'

const SEED: CompleteAttachment[] = [
  {
    id: 'clip',
    type: 'document',
    name: 'Screen recording',
    content: [{type: 'document', source: {type: 'data', value: '', mimeType: RECORDING_MIME}}],
    status: {type: 'complete'},
  },
]

function FakeRecordingCard(props: AttachmentCardProps): JSX.Element {
  const attachment = useAttachment()
  const [playing, setPlaying] = createSignal(false)
  return (
    <div class="px-3 rounded-[var(--chat-radius-pill)] flex gap-2 h-10 [border:1px_solid_var(--chat-line)] items-center">
      <span>Screen recording · 8 actions</span>
      <button type="button" onClick={() => setPlaying(true)}>
        {playing() ? 'Playing' : 'Play'}
      </button>
      <Show when={props.onRemove}>
        {(remove) => (
          <CornerRemoveButton label={`Remove ${attachment.name}`} onRemove={() => remove()(attachment.id)} />
        )}
      </Show>
    </div>
  )
}

function Frame(): JSX.Element {
  const [attachments, setAttachments] = createSignal<CompleteAttachment[]>(SEED)
  const remove = (id: string) => setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  return (
    <ComposerProvider
      value={{
        attachments,
        attachmentAdapter: () => undefined,
        addAttachment: async () => null,
        hasAttachment: () => false,
        replaceAttachment: async () => null,
        removeAttachment: async (id) => {
          setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
        },
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
              <AttachmentByMime cards={[{mime: RECORDING_MIME, render: FakeRecordingCard}]} onRemove={remove} />
            </AttachmentProvider>
          )}
        </For>
      </div>
    </ComposerProvider>
  )
}

export const CardChipWithRemove: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByRole('button', {name: 'Play'})).toBeVisible())
    const remove = c.getByRole('button', {name: 'Remove Screen recording'})
    await userEvent.tab()
    await userEvent.tab()
    await waitFor(() => expect(remove).toHaveFocus())
    expect(remove.matches(':focus-visible')).toBe(true)
    await waitFor(() => expect(remove).toBeVisible())
    expect(remove.querySelector('svg')).not.toBeNull()

    const playRect = c.getByRole('button', {name: 'Play'}).getBoundingClientRect()
    const removeRect = remove.getBoundingClientRect()
    const overlaps = !(
      playRect.right <= removeRect.left ||
      removeRect.right <= playRect.left ||
      playRect.bottom <= removeRect.top ||
      removeRect.bottom <= playRect.top
    )
    expect(overlaps).toBe(false)

    await userEvent.click(c.getByRole('button', {name: 'Play'}))
    await waitFor(() => expect(c.getByRole('button', {name: 'Playing'})).toBeVisible())

    await userEvent.click(c.getByRole('button', {name: 'Remove Screen recording'}))
    await waitFor(() => expect(c.queryByText('Screen recording · 8 actions')).toBeNull())
  },
}
