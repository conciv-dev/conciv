import {Show, type JSX} from 'solid-js'
import {ArrowUp, Paperclip, Square} from 'lucide-solid'
import {Composer as ComposerPrimitive} from '../primitives/composer/composer.js'
import type {AttachmentAdapter} from '../primitives/attachment/attachment-adapter.js'
import {useComposer} from '../store/chat-context.js'
import {AttachmentUI} from './attachment-ui.js'

export type ComposerProps = {
  placeholder?: string

  inputLabel?: string
  children?: JSX.Element
  busy?: JSX.Element
  popover?: JSX.Element
  inputRef?: (element: HTMLTextAreaElement) => void
  attachmentAdapter?: AttachmentAdapter
}

const BTN =
  'size-8.5 rounded-[var(--chat-radius-pill)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center [transition:background-color_120ms_var(--chat-ease),transform_120ms_var(--chat-ease)] [&:active:not(:disabled)]:scale-[0.92]'
const SEND = `${BTN} [background:var(--chat-accent)] text-[color:var(--chat-on-accent)] [&:hover:not(:disabled)]:[background:var(--chat-accent-hi)] disabled:opacity-40 disabled:cursor-default`
const CANCEL = `${BTN} [background:var(--chat-text-3)] [color:var(--chat-on-accent)]`
const INPUT =
  'block max-h-30 px-2 pb-1 pt-2 [color:var(--chat-text)] text-[length:var(--chat-text-md)] leading-[1.45] placeholder:[color:var(--chat-text-3)]'

function TrailingControls(): JSX.Element {
  const composer = useComposer()
  return (
    <>
      <ComposerPrimitive.Cancel class={CANCEL} aria-label="Stop generating">
        <Square size={14} fill="currentColor" aria-hidden="true" />
      </ComposerPrimitive.Cancel>
      <Show when={!composer.canCancel()}>
        <ComposerPrimitive.Send class={SEND} aria-label="Send message">
          <ArrowUp size={18} aria-hidden="true" />
        </ComposerPrimitive.Send>
      </Show>
    </>
  )
}

function RemovableAttachment(): JSX.Element {
  return <AttachmentUI removable />
}

export function Composer(props: ComposerProps): JSX.Element {
  return (
    <ComposerPrimitive.Root attachmentAdapter={props.attachmentAdapter} class="flex flex-col gap-1.5 relative">
      {props.popover}
      <div class="flex flex-wrap gap-1 empty:hidden">
        <ComposerPrimitive.Attachments component={RemovableAttachment} />
      </div>
      <div class="px-1.5 pb-1.5 pt-1 rounded-[var(--chat-radius-md)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [transition:border-color_120ms_var(--chat-ease)] focus-within:[border-color:var(--chat-accent)]">
        <ComposerPrimitive.Input
          unstyled
          ref={props.inputRef}
          placeholder={props.placeholder ?? 'Message…'}
          class={INPUT}
          aria-label={props.inputLabel ?? 'Message'}
          addAttachmentOnPaste={props.attachmentAdapter !== undefined}
        />
        <div class="pt-0.5 flex gap-1 items-center">
          <Show when={props.attachmentAdapter}>
            <ComposerPrimitive.AddAttachment
              class={`${BTN} text-[color:var(--chat-text-2)] bg-transparent hover:bg-[var(--chat-fill-strong)]`}
            >
              <Paperclip size={16} aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
          </Show>
          <Show when={props.children}>{props.children}</Show>
          <div class="ml-auto flex gap-1 items-center">
            <Show when={props.busy} fallback={<TrailingControls />}>
              {props.busy}
            </Show>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}
