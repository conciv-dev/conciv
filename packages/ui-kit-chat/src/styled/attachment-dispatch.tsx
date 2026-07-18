import {Show, type JSX, type ValidComponent} from 'solid-js'
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

export type AttachmentCardSlot = {mime: string; render: ValidComponent}

function attachmentMime(attachment: AttachmentState): string | undefined {
  if ('content' in attachment)
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') return part.source.mimeType
  return attachment.contentType
}

export function AttachmentByMime(props: {cards: readonly AttachmentCardSlot[]; removable?: boolean}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  return (
    <Show when={card()} fallback={<AttachmentUI removable={props.removable} />}>
      {(entry) => (
        <Attachment.Root class="flex gap-1 items-center">
          <Dynamic component={entry().render} />
          <Show when={props.removable}>
            <Attachment.Remove
              class={`rounded-[var(--chat-radius-pill)] inline-flex shrink-0 size-6 cursor-pointer [color:var(--chat-text-2)] items-center justify-center hover:[background:var(--chat-fill)] hover:[color:var(--chat-danger)] ${FOCUS}`}
            >
              <X size={12} />
            </Attachment.Remove>
          </Show>
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
