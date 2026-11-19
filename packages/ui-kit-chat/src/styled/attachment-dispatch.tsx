import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import X from 'lucide-solid/icons/x'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {AttachmentUI} from './attachment-ui.js'
import {FOCUS} from './classes.js'
import {
  attachmentId,
  fileToDataSource,
  type Attachment as AttachmentState,
  type AttachmentAdapter,
} from '../primitives/attachment/attachment-adapter.js'

export type AttachmentCardProps = {remove?: JSX.Element; onRemove?: (id: string) => void}

export type AttachmentCardSlot = {mime: string; render: Component<AttachmentCardProps>}

function attachmentMime(attachment: AttachmentState): string | undefined {
  const parts = 'content' in attachment ? attachment.content : []
  const documentMimes = parts.flatMap((part) =>
    part.type === 'document' && part.source.type === 'data' ? [part.source.mimeType] : [],
  )
  return documentMimes[0] ?? attachment.contentType
}

function RemoveChipButton(props: {attachment: AttachmentState; onRemove: (id: string) => void}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Remove ${props.attachment.name}`}
      onClick={() => props.onRemove(props.attachment.id)}
      class={`rounded-[var(--chat-radius-pill)] inline-flex shrink-0 size-7 cursor-pointer [color:var(--chat-text-2)] items-center justify-center hover:[background:var(--chat-fill-strong)] hover:[color:var(--chat-danger)] ${FOCUS}`}
    >
      <X size={14} />
    </button>
  )
}

export function AttachmentByMime(props: {
  cards: readonly AttachmentCardSlot[]
  onRemove?: (id: string) => void
}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  const removeButton = (): JSX.Element => {
    const onRemove = props.onRemove
    return onRemove ? <RemoveChipButton attachment={attachment} onRemove={onRemove} /> : undefined
  }
  return (
    <Show when={card()} fallback={<AttachmentUI onRemove={props.onRemove} />}>
      {(entry) => (
        <Attachment.Root>
          <Dynamic component={entry().render} remove={removeButton()} onRemove={props.onRemove} />
        </Attachment.Root>
      )}
    </Show>
  )
}

export function createDocumentAttachmentAdapter(mime: string): AttachmentAdapter {
  return {
    accept: mime,
    add: async ({file}) => ({
      id: `document-${attachmentId()}`,
      type: 'document',
      name: file.name,
      contentType: mime,
      file,
      status: {type: 'requires-action', reason: 'composer-send'},
    }),
    remove: async () => {},
    send: async (attachment) => ({
      ...attachment,
      status: {type: 'complete'},
      content: [{type: 'document', source: await fileToDataSource(attachment.file)}],
    }),
  }
}
