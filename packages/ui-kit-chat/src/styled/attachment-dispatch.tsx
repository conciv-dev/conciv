import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {X} from 'lucide-solid'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {AttachmentUI} from './attachment-ui.js'
import {FOCUS} from './classes.js'
import {
  fileToDataSource,
  type Attachment as AttachmentState,
  type AttachmentAdapter,
} from '../primitives/attachment/attachment-adapter.js'

export type AttachmentCardProps = {remove?: JSX.Element}

export type AttachmentCardSlot = {mime: string; render: Component<AttachmentCardProps>}

function attachmentMime(attachment: AttachmentState): string | undefined {
  const parts = 'content' in attachment ? attachment.content : []
  const documentMimes = parts.flatMap((part) =>
    part.type === 'document' && part.source.type === 'data' ? [part.source.mimeType] : [],
  )
  return documentMimes[0] ?? attachment.contentType
}

function RemoveChipButton(): JSX.Element {
  return (
    <Attachment.Remove
      class={`rounded-[var(--chat-radius-pill)] inline-flex shrink-0 size-7 cursor-pointer [color:var(--chat-text-2)] items-center justify-center hover:[background:var(--chat-fill-strong)] hover:[color:var(--chat-danger)] ${FOCUS}`}
    >
      <X size={14} />
    </Attachment.Remove>
  )
}

export function AttachmentByMime(props: {cards: readonly AttachmentCardSlot[]; removable?: boolean}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  return (
    <Show when={card()} fallback={<AttachmentUI removable={props.removable} />}>
      {(entry) => (
        <Attachment.Root>
          <Dynamic component={entry().render} remove={props.removable ? <RemoveChipButton /> : undefined} />
        </Attachment.Root>
      )}
    </Show>
  )
}

let documentId = 0

export function createDocumentAttachmentAdapter(mime: string): AttachmentAdapter {
  return {
    accept: mime,
    add: async ({file}) => ({
      id: `document-${(documentId += 1)}`,
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
