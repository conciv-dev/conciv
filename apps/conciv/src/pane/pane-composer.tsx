import {createSignal, Show, Suspense, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import ArrowUp from 'lucide-solid/icons/arrow-up'
import Clock from 'lucide-solid/icons/clock'
import Ellipsis from 'lucide-solid/icons/ellipsis'
import Paperclip from 'lucide-solid/icons/paperclip'
import Square from 'lucide-solid/icons/square'
import {
  ComposerActionsHost,
  ComposerPrimitive,
  QueueItem,
  AttachmentUI,
  useComposer,
  type AttachmentAdapter,
} from '@conciv/ui-kit-chat'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import type {WebStorage} from '@conciv/storage-history'
import {useEngineReachability} from '../app/reachability.js'
import {
  ComposerInputAdapter,
  type ComposerInputHandle,
  type ComposerTriggerSources,
  type SelectionOffsets,
} from './composer-input-adapter.js'

export type PaneComposerProps = {
  draftStorage: WebStorage
  draftKey: string
  placeholder: string
  inputLabel: string
  children?: JSX.Element
  trailingExtras?: JSX.Element
  busy?: JSX.Element
  triggers?: ComposerTriggerSources
  onInputReady?: (handle: ComposerInputHandle) => void
  onSelectionChange?: (offsets: SelectionOffsets) => void
  initialSelection?: SelectionOffsets
  attachmentAdapter?: AttachmentAdapter
  AttachmentComponent?: Component<{removable?: boolean}>
}

const BTN =
  'size-8.5 rounded-[var(--chat-radius-pill)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center [transition:background-color_120ms_var(--chat-ease),transform_120ms_var(--chat-ease)] [&:active:not(:disabled)]:scale-[0.92]'
const SEND = `${BTN} [background:var(--chat-accent)] text-[color:var(--chat-on-accent)] [&:hover:not(:disabled)]:[background:var(--chat-accent-hi)] disabled:opacity-40 disabled:cursor-default`
const CANCEL = `${BTN} [background:var(--chat-text-3)] [color:var(--chat-on-accent)]`
const GHOST = `${BTN} text-[color:var(--chat-text-2)] bg-transparent [&:hover:not(:disabled)]:bg-[var(--chat-fill-strong)] disabled:opacity-40 disabled:cursor-default`
const INPUT = '[color:var(--chat-text)] text-[length:var(--chat-text-md)]'
const QUEUE_ROW =
  'text-[length:var(--chat-text-md)] py-1.5 pl-3 pr-1.5 flex gap-2 [color:var(--chat-text-2)] items-center [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'
const QUEUE_ACTION =
  'shrink-0 px-2 py-1 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] cursor-pointer font-medium text-[length:var(--chat-text-md)] leading-[1.45] [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease),transform_100ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] [&:active]:scale-[0.96]'

const ENGINE_UNREACHABLE_LABEL = 'conciv lost connection to the engine'
const ATTACHMENT_LABEL = 'Add an attachment'
const SEND_LABEL = 'Send message'
const STOP_LABEL = 'Stop generating'
const MAX_INLINE_AUTO_ACTIONS = 0

function ComposerSendControl(): JSX.Element {
  const composer = useComposer()
  const reachability = useEngineReachability()
  return (
    <Show
      when={composer.canCancel()}
      fallback={
        <TooltipIconButtonSlot
          tooltip={reachability.online() ? SEND_LABEL : ENGINE_UNREACHABLE_LABEL}
          wrapperClass="shrink-0"
        >
          {(buttonProps) => (
            <ComposerPrimitive.Send {...buttonProps()} class={SEND} disabled={!reachability.online()}>
              <ArrowUp size={18} aria-hidden="true" />
            </ComposerPrimitive.Send>
          )}
        </TooltipIconButtonSlot>
      }
    >
      <TooltipIconButtonSlot tooltip={STOP_LABEL} wrapperClass="shrink-0">
        {(buttonProps) => (
          <ComposerPrimitive.Cancel {...buttonProps()} class={CANCEL}>
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </ComposerPrimitive.Cancel>
        )}
      </TooltipIconButtonSlot>
    </Show>
  )
}

export function PaneComposer(props: PaneComposerProps): JSX.Element {
  const [inputHandle, setInputHandle] = createSignal<ComposerInputHandle>()
  const receiveInputHandle = (handle: ComposerInputHandle): void => {
    setInputHandle(handle)
    props.onInputReady?.(handle)
  }
  return (
    <ComposerPrimitive.Root
      attachmentAdapter={props.attachmentAdapter}
      draftStorage={props.draftStorage}
      draftKey={props.draftKey}
      class="flex flex-col gap-1.5 relative shrink-0"
    >
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
      <div class="flex flex-wrap gap-1 empty:hidden min-h-0 shrink max-h-[25vh] overflow-y-auto">
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
          editableClass={INPUT}
          inputLabel={props.inputLabel}
          addAttachmentOnPaste={props.attachmentAdapter !== undefined}
          triggers={props.triggers}
          onReady={receiveInputHandle}
          onSelectionChange={props.onSelectionChange}
          initialSelection={props.initialSelection}
        />
        <ComposerActionsHost
          triggerContent={<Ellipsis class="size-5 block" aria-hidden="true" />}
          maxInlineAuto={MAX_INLINE_AUTO_ACTIONS}
          onOverflowDismissed={() => inputHandle()?.focus()}
          leading={
            <Show when={props.attachmentAdapter}>
              <TooltipIconButtonSlot tooltip={ATTACHMENT_LABEL}>
                {(buttonProps) => (
                  <ComposerPrimitive.AddAttachment {...buttonProps()} class={GHOST}>
                    <Paperclip size={16} aria-hidden="true" />
                  </ComposerPrimitive.AddAttachment>
                )}
              </TooltipIconButtonSlot>
            </Show>
          }
          trailing={
            <>
              <Suspense fallback={<span class="size-8.5 shrink-0" />}>{props.trailingExtras}</Suspense>
              <Show when={props.busy} fallback={<ComposerSendControl />}>
                {props.busy}
              </Show>
            </>
          }
        >
          {props.children}
        </ComposerActionsHost>
      </div>
    </ComposerPrimitive.Root>
  )
}
