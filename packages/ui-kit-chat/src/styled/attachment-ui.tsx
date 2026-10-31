import {createSignal, onCleanup, Show, type JSX} from 'solid-js'
import FileText from 'lucide-solid/icons/file-text'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import X from 'lucide-solid/icons/x'
import {Tooltip, TooltipIconButtonSlot, ZoomableImage} from '@conciv/ui-kit-system'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {isCompleteAttachment, type AttachmentContentPart} from '../primitives/attachment/attachment-adapter.js'
import {panelLayer} from '../tools/styled/result-image.js'
import {FOCUS, FOCUS_INSET} from './classes.js'

const TILE =
  'relative size-14 overflow-hidden rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] cursor-default anim-presence-in'

const IMAGE_TRIGGER = `size-full block !border-0 !cursor-zoom-in ${FOCUS_INSET}`

const REMOVE_WRAPPER = 'absolute end-0.5 top-0.5'
const REMOVE = `inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-pill)] [background:var(--chat-panel)] [color:var(--chat-text-2)] shadow-[var(--chat-shadow-lg)] cursor-pointer hover:[color:var(--chat-danger)] ${FOCUS}`

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

export function AttachmentUI(props: {removable?: boolean; failure?: string}): JSX.Element {
  const draft = useAttachment()
  const localSrc = localImageSrc(draft)
  const previewSrc = imageSrc(draft) ?? localSrc
  revokeOnCleanup(localSrc)
  const [tile, setTile] = createSignal<HTMLElement>()
  const viewerLayer = () => panelLayer(tile()) ?? tile()?.ownerDocument.body
  const label = () => props.failure ?? draft.name
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: 'top', gutter: 6}}>
      <Attachment.Root ref={setTile} class={TILE}>
        <Show
          when={props.failure ? undefined : previewSrc}
          fallback={
            <Tooltip.Trigger type="button" class={`size-full block ${FOCUS_INSET}`} aria-label={label()}>
              <span
                class={`flex size-full items-center justify-center ${props.failure ? '[color:var(--chat-danger)]' : '[color:var(--chat-text-3)]'}`}
              >
                <Show when={props.failure} fallback={<FileText size={28} />}>
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
                  portal={viewerLayer()}
                  thumbnail={{...triggerProps(), class: IMAGE_TRIGGER}}
                  imageClass="size-full object-cover"
                />
              )}
            />
          )}
        </Show>
        <Show when={props.removable}>
          <TooltipIconButtonSlot tooltip={`Remove ${draft.name}`} wrapperClass={REMOVE_WRAPPER}>
            {(buttonProps) => (
              <Attachment.Remove {...buttonProps()} class={REMOVE}>
                <X size={12} />
              </Attachment.Remove>
            )}
          </TooltipIconButtonSlot>
        </Show>
      </Attachment.Root>
      <Tooltip.Positioner>
        <Tooltip.Content>{label()}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
