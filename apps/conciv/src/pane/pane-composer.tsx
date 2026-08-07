import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ArrowUp, Clock, Paperclip, RefreshCw, Square} from 'lucide-solid'
import {ComposerPrimitive, QueueItem, AttachmentUI, type AttachmentAdapter} from '@conciv/ui-kit-chat'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import type {WebStorage} from '@conciv/storage-history'
import {ComposerInputAdapter, type ComposerInputHandle, type SelectionOffsets} from './composer-input-adapter.js'

export type PaneComposerProps = {
  draftStorage: WebStorage
  draftKey: string
  placeholder: string
  inputLabel: string
  children?: JSX.Element
  busy?: JSX.Element
  popover?: JSX.Element
  onInputReady?: (handle: ComposerInputHandle) => void
  onSelectionChange?: (offsets: SelectionOffsets) => void
  attachmentAdapter?: AttachmentAdapter
  AttachmentComponent?: Component<{removable?: boolean}>
}

const BTN =
  'size-8.5 rounded-[var(--chat-radius-pill)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center [transition:background-color_120ms_var(--chat-ease),transform_120ms_var(--chat-ease)] [&:active:not(:disabled)]:scale-[0.92]'
const SEND = `${BTN} [background:var(--chat-accent)] text-[color:var(--chat-on-accent)] [&:hover:not(:disabled)]:[background:var(--chat-accent-hi)] disabled:opacity-40 disabled:cursor-default`
const CANCEL = `${BTN} [background:var(--chat-text-3)] [color:var(--chat-on-accent)]`
const GHOST = `${BTN} text-[color:var(--chat-text-2)] bg-transparent [&:hover:not(:disabled)]:bg-[var(--chat-fill-strong)] disabled:opacity-40 disabled:cursor-default`
const INPUT =
  'block max-h-30 px-2 pb-1 pt-2 [color:var(--chat-text)] text-[length:var(--chat-text-md)] leading-[1.45] placeholder:[color:var(--chat-text-3)]'
const QUEUE_ROW =
  'text-[length:var(--chat-text-md)] py-1.5 pl-3 pr-1.5 flex gap-2 [color:var(--chat-text-2)] items-center [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'
const QUEUE_ACTION =
  'shrink-0 px-2 py-1 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] cursor-pointer font-medium text-[length:var(--chat-text-md)] leading-[1.45] [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease),transform_100ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] [&:active]:scale-[0.96]'

function TrailingControls(): JSX.Element {
  return (
    <>
      <TooltipIconButtonSlot tooltip="Refresh the conversation" class={GHOST}>
        {(buttonProps) => (
          <ComposerPrimitive.Refresh {...buttonProps()}>
            <RefreshCw size={16} aria-hidden="true" />
          </ComposerPrimitive.Refresh>
        )}
      </TooltipIconButtonSlot>
      <ComposerPrimitive.Cancel class={CANCEL} aria-label="Stop generating">
        <Square size={14} fill="currentColor" aria-hidden="true" />
      </ComposerPrimitive.Cancel>
      <ComposerPrimitive.Send class={SEND} aria-label="Send message">
        <ArrowUp size={18} aria-hidden="true" />
      </ComposerPrimitive.Send>
    </>
  )
}

export function PaneComposer(props: PaneComposerProps): JSX.Element {
  return (
    <ComposerPrimitive.Root
      attachmentAdapter={props.attachmentAdapter}
      draftStorage={props.draftStorage}
      draftKey={props.draftKey}
      class="flex flex-col gap-1.5 relative"
    >
      {props.popover}
      <div class="rounded-[var(--chat-radius-md)] flex flex-col [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] empty:hidden">
        <ComposerPrimitive.Queue>
          {() => (
            <div class={QUEUE_ROW}>
              <Clock size={14} class="shrink-0 [color:var(--chat-text-3)]" aria-hidden="true" />
              <QueueItem.Text class="flex-1 min-w-0 truncate" />
              <QueueItem.Steer class={`${QUEUE_ACTION} [color:var(--chat-accent)]`}>Steer</QueueItem.Steer>
              <QueueItem.Remove class={`${QUEUE_ACTION} [color:var(--chat-text-3)] hover:[color:var(--chat-text)]`}>
                Remove
              </QueueItem.Remove>
            </div>
          )}
        </ComposerPrimitive.Queue>
      </div>
      <div class="flex flex-wrap gap-1 empty:hidden">
        <ComposerPrimitive.Attachments
          component={() => (
            <Show when={props.AttachmentComponent} fallback={<AttachmentUI removable />}>
              {(component) => <Dynamic component={component()} removable />}
            </Show>
          )}
        />
      </div>
      <div class="px-1.5 pb-1.5 pt-1 rounded-[var(--chat-radius-md)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [transition:border-color_120ms_var(--chat-ease)] focus-within:[border-color:var(--chat-accent)]">
        <ComposerInputAdapter
          placeholder={props.placeholder}
          class={INPUT}
          inputLabel={props.inputLabel}
          addAttachmentOnPaste={props.attachmentAdapter !== undefined}
          onReady={props.onInputReady}
          onSelectionChange={props.onSelectionChange}
        />
        <div class="pt-0.5 flex gap-1 items-center">
          <Show when={props.attachmentAdapter}>
            <ComposerPrimitive.AddAttachment class={GHOST}>
              <Paperclip size={16} aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
          </Show>
          {props.children}
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
