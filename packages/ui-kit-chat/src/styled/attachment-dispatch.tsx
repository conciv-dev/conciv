import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {useComposerContext} from '../primitives/composer/composer-context.js'
import {AttachmentUI} from './attachment-ui.js'
import {CornerRemoveButton} from './corner-remove-button.js'
import {
  attachmentId,
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

function RemoveCardButton(): JSX.Element {
  const attachment = useAttachment()
  const composer = useComposerContext()
  return (
    <CornerRemoveButton
      label={`Remove ${attachment.name}`}
      onRemove={() => void composer.removeAttachment(attachment.id)}
    />
  )
}

export function AttachmentByMime(props: {cards: readonly AttachmentCardSlot[]; removable?: boolean}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  return (
    <Show when={card()} fallback={<AttachmentUI removable={props.removable} />}>
      {(entry) => (
        <Attachment.Root class={props.removable ? 'group pt-3 pe-3' : undefined}>
          <Dynamic component={entry().render} remove={props.removable ? <RemoveCardButton /> : undefined} />
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
