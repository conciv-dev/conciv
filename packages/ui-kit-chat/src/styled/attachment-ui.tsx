import {onCleanup, Show, type JSX} from 'solid-js'
import FileText from 'lucide-solid/icons/file-text'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {Tooltip, ZoomableImage} from '@conciv/ui-kit-system'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {isCompleteAttachment, type AttachmentContentPart} from '../primitives/attachment/attachment-adapter.js'
import {FOCUS_INSET} from './classes.js'
import {CornerRemoveButton} from './corner-remove-button.js'

const ROOT = 'group relative shrink-0 anim-presence-in'
const TILE =
  'size-14 overflow-hidden rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] cursor-default'

const IMAGE_TRIGGER = `size-full block !border-0 !cursor-zoom-in ${FOCUS_INSET}`

type AttachmentState = ReturnType<typeof useAttachment>
type ImagePart = Extract<AttachmentContentPart, {type: 'image'}>

function isImagePart(part: AttachmentContentPart): part is ImagePart {
  return part.type === 'image'
}

function completedImagePart(attachment: AttachmentState): ImagePart | undefined {
  if (attachment.type !== 'image') return undefined
  if (!isCompleteAttachment(attachment)) return undefined
  return attachment.content.find(isImagePart)
}

function imageSrc(attachment: AttachmentState): string | undefined {
  const part = completedImagePart(attachment)
  if (!part) return undefined
  const source = part.source
  return source.type === 'url' ? source.value : `data:${source.mimeType};base64,${source.value}`
}

function createObjectUrl(file: File): string | undefined {
  if (typeof URL === 'undefined') return undefined
  if (!('createObjectURL' in URL)) return undefined
  return URL.createObjectURL(file)
}

function localImageSrc(attachment: AttachmentState): string | undefined {
  if (attachment.type !== 'image') return undefined
  if (!attachment.file) return undefined
  return createObjectUrl(attachment.file)
}

function revokeOnCleanup(source: string | undefined): void {
  if (!source) return
  onCleanup(() => URL.revokeObjectURL(source))
}

function refusalReason(attachment: AttachmentState): string | undefined {
  if (attachment.status.type !== 'incomplete') return undefined
  return attachment.status.message || `${attachment.name} could not be attached`
}

export type RemoveAttachment = (id: string) => void

export function AttachmentUI(props: {onRemove?: RemoveAttachment; failure?: string}): JSX.Element {
  const draft = useAttachment()
  const localSrc = localImageSrc(draft)
  const previewSrc = imageSrc(draft) ?? localSrc
  revokeOnCleanup(localSrc)
  const failure = () => props.failure ?? refusalReason(draft)
  const label = () => failure() ?? draft.name
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: 'top', gutter: 6}}>
      <Attachment.Root class={ROOT}>
        <div class={TILE}>
          <Show
            when={failure() ? undefined : previewSrc}
            fallback={
              <Tooltip.Trigger type="button" class={`size-full block ${FOCUS_INSET}`} aria-label={label()}>
                <span
                  class={`flex size-full items-center justify-center ${failure() ? '[color:var(--chat-danger)]' : '[color:var(--chat-text-3)]'}`}
                >
                  <Show when={failure()} fallback={<FileText size={28} />}>
                    <TriangleAlert size={28} />
                  </Show>
                </span>
              </Tooltip.Trigger>
            }
          >
            {(src) => (
              <Tooltip.Trigger
                asChild={(triggerProps) => (
                  <ZoomableImage
                    src={src()}
                    alt={draft.name}
                    thumbnail={{...triggerProps(), class: IMAGE_TRIGGER}}
                    imageClass="size-full object-cover"
                  />
                )}
              />
            )}
          </Show>
        </div>
        <Show when={props.onRemove}>
          {(remove) => <CornerRemoveButton label={`Remove ${draft.name}`} onRemove={() => remove()(draft.id)} />}
        </Show>
      </Attachment.Root>
      <Tooltip.Positioner>
        <Tooltip.Content>{label()}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
