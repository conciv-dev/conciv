import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import Paperclip from 'lucide-solid/icons/paperclip'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {Composer as ComposerPrimitive} from '../primitives/composer/composer.js'
import {useComposerContext} from '../primitives/composer/composer-context.js'
import {useComposerHandlers} from '../primitives/composer/composer-handlers.js'
import {useComposer} from '../store/chat-context.js'
import type {AttachmentAdapter} from '../primitives/attachment/attachment-adapter.js'
import {AttachmentUI} from './attachment-ui.js'
import {Slot} from '../primitives/util/slot.js'

export type ComposerProps = {
  placeholder?: string

  inputLabel?: string
  children?: JSX.Element
  busy?: JSX.Element
  inputRef?: (element: HTMLTextAreaElement) => void
  attachmentAdapter?: AttachmentAdapter
  AttachmentComponent?: Component<{removable?: boolean}>
}

const GHOST =
  'size-7 rounded-[var(--chat-radius-sm)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center text-chat-text-2 bg-transparent [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] [&:hover:not(:disabled)]:[background:var(--chat-fill-strong)] [&:hover:not(:disabled)]:text-chat-text-hi disabled:opacity-40 disabled:cursor-default'
const INPUT =
  'block max-h-30 [color:var(--chat-text-hi)] text-[length:var(--chat-text-md)] leading-[1.45] placeholder:[color:var(--chat-text-3)]'
const GUTTER = 'flex-none pt-1.5 select-none [font-family:var(--chat-mono)] text-[13px] [color:var(--chat-accent)]'
const ATTACHMENT_LABEL = 'Add an attachment'
const SEND_LABEL = 'Send message'
const STOP_LABEL = 'Stop generating'
const TRAILING_BTN =
  'flex-none inline-flex items-center gap-1.5 py-1 px-2.5 rounded-[var(--chat-radius-sm)] [border:none] cursor-pointer [font-family:var(--chat-font)] text-[12.5px] font-medium bg-transparent [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] disabled:opacity-40 disabled:cursor-default'
const TRAILING_SEND_ACTIVE =
  'text-chat-on-accent [background:var(--chat-accent)] hover:[background:var(--chat-accent-hi)]'
const TRAILING_SEND_IDLE = 'text-chat-text-3'
const TRAILING_STOP = 'text-chat-text-2'
const TRAILING_HINT = '[font-family:var(--chat-mono)] text-[10px] opacity-70'

function TrailingControls(): JSX.Element {
  const composer = useComposer()
  const context = useComposerContext()
  const handlers = useComposerHandlers()
  const stopping = () => composer.canCancel()
  const cancel = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  const sendDisabled = () => context.sendingAttachments() || (!composer.canSend() && context.attachments().length === 0)
  return (
    <Show
      when={stopping()}
      fallback={
        <button
          type="submit"
          class={`${TRAILING_BTN} ${sendDisabled() ? TRAILING_SEND_IDLE : TRAILING_SEND_ACTIVE}`}
          disabled={sendDisabled()}
          aria-label={SEND_LABEL}
        >
          Send
          <span class={TRAILING_HINT} aria-hidden="true">
            ⏎
          </span>
        </button>
      }
    >
      <button
        type="button"
        class={`${TRAILING_BTN} ${TRAILING_STOP}`}
        aria-label={STOP_LABEL}
        onClick={(event) => {
          event.preventDefault()
          cancel()
        }}
      >
        Stop
        <span class={TRAILING_HINT} aria-hidden="true">
          ^C
        </span>
      </button>
    </Show>
  )
}

export function Composer(props: ComposerProps): JSX.Element {
  return (
    <ComposerPrimitive.Root
      attachmentAdapter={props.attachmentAdapter}
      class="flex flex-col relative [background:var(--chat-rail-bg)] [border-block-start:1px_solid_var(--chat-line)]"
    >
      <div class="flex flex-wrap gap-1 px-3 pt-2 empty:hidden">
        <ComposerPrimitive.Attachments
          component={() => (
            <Show when={props.AttachmentComponent} fallback={<AttachmentUI removable />}>
              {(component) => <Dynamic component={component()} removable />}
            </Show>
          )}
        />
      </div>
      <div class="flex items-start gap-2 pt-2.25 pe-3 pb-2.25 ps-5">
        <span class={GUTTER} aria-hidden="true">
          ❯
        </span>
        <ComposerPrimitive.Input
          unstyled
          ref={props.inputRef}
          placeholder={props.placeholder ?? 'Ask anything…'}
          class={`${INPUT} flex-1 pt-1.5`}
          aria-label={props.inputLabel ?? 'Message'}
          addAttachmentOnPaste={props.attachmentAdapter !== undefined}
        />
        <Show when={props.attachmentAdapter}>
          <TooltipIconButtonSlot tooltip={ATTACHMENT_LABEL} wrapperClass="shrink-0">
            {(buttonProps) => (
              <ComposerPrimitive.AddAttachment {...buttonProps()} class={GHOST}>
                <Paperclip size={16} aria-hidden="true" />
              </ComposerPrimitive.AddAttachment>
            )}
          </TooltipIconButtonSlot>
        </Show>
        <Slot>{props.children}</Slot>
        <Slot fallback={<TrailingControls />}>{props.busy}</Slot>
      </div>
    </ComposerPrimitive.Root>
  )
}
