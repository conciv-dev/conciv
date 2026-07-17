import {onCleanup, Show, type JSX} from 'solid-js'
import {FileText, X} from 'lucide-solid'
import {Tooltip} from '@conciv/ui-kit-system'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {isCompleteAttachment, type AttachmentContentPart} from '../primitives/attachment/attachment-adapter.js'
import {FOCUS, FOCUS_INSET} from './classes.js'

const TILE =
  'relative size-14 overflow-hidden rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] cursor-default anim-presence-in'

const REMOVE = `absolute end-0.5 top-0.5 inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-pill)] [background:var(--chat-panel)] [color:var(--chat-text-2)] shadow-[var(--chat-shadow-lg)] cursor-pointer hover:[color:var(--chat-danger)] ${FOCUS}`

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

export function AttachmentUI(props: {removable?: boolean}): JSX.Element {
  const draft = useAttachment()
  const localSrc = localImageSrc(draft)
  const previewSrc = imageSrc(draft) ?? localSrc
  revokeOnCleanup(localSrc)
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: 'top', gutter: 6}}>
      <Attachment.Root class={TILE}>
        <Tooltip.Trigger class={`size-full block ${FOCUS_INSET}`} aria-label={draft.name}>
          <Show
            when={previewSrc}
            fallback={
              <span class="flex size-full [color:var(--chat-text-3)] items-center justify-center">
                <FileText size={28} />
              </span>
            }
          >
            {(src) => <img src={src()} alt={draft.name} class="size-full object-cover" />}
          </Show>
        </Tooltip.Trigger>
        <Show when={props.removable}>
          <Attachment.Remove class={REMOVE} aria-label={`Remove ${draft.name}`}>
            <X size={12} />
          </Attachment.Remove>
        </Show>
      </Attachment.Root>
      <Tooltip.Positioner>
        <Tooltip.Content>{draft.name}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
