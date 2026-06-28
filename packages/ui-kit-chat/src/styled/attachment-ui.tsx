import {Show, type JSX} from 'solid-js'
import {FileText, X} from 'lucide-solid'
import {Tooltip} from '@mandarax/ui-kit-system'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {FOCUS, FOCUS_INSET} from './classes.js'

// assistant-ui's AttachmentUI tile: a square thumb (image preview or file-icon fallback) with the file
// name in a tooltip; composer attachments also get a remove button. Neutral tokens.
const TILE =
  'relative size-14 overflow-hidden rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] cursor-default'
// 24px hit target (WCAG 2.5.8) — the X glyph stays small, the button area meets the minimum.
const REMOVE = `absolute end-0.5 top-0.5 inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-pill)] [background:var(--chat-panel)] [color:var(--chat-text-2)] shadow-[var(--chat-shadow-lg)] cursor-pointer hover:[color:var(--chat-danger)] ${FOCUS}`

function isImage(draft: ReturnType<typeof useAttachment>): boolean {
  return draft.part.type === 'image'
}

function imageSrc(draft: ReturnType<typeof useAttachment>): string | undefined {
  const part = draft.part
  if (part.type !== 'image') return undefined
  const source = part.source
  return source.type === 'url' ? source.value : `data:${source.mimeType};base64,${source.value}`
}

export function AttachmentUI(props: {removable?: boolean}): JSX.Element {
  const draft = useAttachment()
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: 'top', gutter: 6}}>
      <Attachment.Root class={TILE}>
        <Tooltip.Trigger class={`size-full block ${FOCUS_INSET}`} aria-label={draft.name}>
          <Show
            when={isImage(draft) && imageSrc(draft)}
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
