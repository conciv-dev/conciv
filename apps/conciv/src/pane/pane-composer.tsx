import {Show, createMemo, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import Ellipsis from 'lucide-solid/icons/ellipsis'
import Plus from 'lucide-solid/icons/plus'
import {
  ComposerActions,
  ComposerActionsHost,
  ComposerPrimitive,
  AttachmentUI,
  useChatContext,
  useComposer,
  useComposerContext,
  type AttachmentAdapter,
  type ComposerDraftWriter,
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
import {lockedMessage} from '../shell/engine-lock-messages.js'

export type PaneComposerProps = {
  draftStorage: WebStorage
  draftWriter?: ComposerDraftWriter
  draftKey: string
  placeholder: string
  inputLabel: string
  children?: JSX.Element
  prompt?: JSX.Element
  busy?: JSX.Element
  triggers?: ComposerTriggerSources
  onInputReady?: (handle: ComposerInputHandle) => void
  onSelectionChange?: (offsets: SelectionOffsets) => void
  attachmentAdapter?: AttachmentAdapter
  AttachmentComponent?: Component<{onRemove?: (id: string) => void}>
  notes?: JSX.Element
}

const GHOST =
  'size-7 rounded-[var(--chat-radius-sm)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center text-chat-text-2 bg-transparent [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] [&:hover:not(:disabled)]:[background:var(--chat-fill-strong)] [&:hover:not(:disabled)]:text-chat-text-hi disabled:opacity-40 disabled:cursor-default'
const INPUT =
  '[font-family:var(--chat-font)] [color:var(--chat-text-hi)] text-[length:0.8125rem] leading-[1.45] placeholder:[color:var(--chat-text-3)]'
const GUTTER =
  'flex-none select-none [font-family:var(--chat-mono)] text-[13px] leading-[1.45] [color:var(--chat-accent)]'
const TRAILING_BTN =
  'flex-none inline-flex items-center justify-center gap-[6px] select-none self-center h-[22px] px-2 rounded-[var(--chat-radius-chip)] [border:none] cursor-pointer [font-family:var(--chat-mono)] text-[9.5px] font-bold tracking-[0.12em] uppercase [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] disabled:cursor-default'
const TRAILING_SEND_ACTIVE = 'bg-chat-accent text-chat-on-accent hover:[background:var(--chat-accent-hi)]'
const TRAILING_SEND_IDLE = '[background:var(--chat-fill-strong)] text-chat-text-2 disabled:opacity-40'
const TRAILING_STOP = '[background:var(--chat-fill-strong)] text-chat-text-hi hover:[background:var(--chat-fill)]'
const TRAILING_HINT = '[font-family:var(--chat-mono)] text-[9px] tracking-normal opacity-65'

const ENGINE_UNREACHABLE_LABEL = 'conciv lost connection to the engine'
const LOCKED_PLACEHOLDER = 'Log in to continue'
const LOCKED_INPUT = 'opacity-50 cursor-not-allowed'
const ATTACHMENT_LABEL = 'Add an attachment'
const SEND_LABEL = 'Send message'
const STOP_LABEL = 'Stop generating'
const STOPPING_LABEL = 'Stopping the run'
const MAX_INLINE_AUTO_ACTIONS = 0

function ComposerSendControl(): JSX.Element {
  const composer = useComposer()
  const context = useComposerContext()
  const reachability = useEngineReachability()
  const locked = () => lockedMessage(reachability.locked())
  const blocked = () => !reachability.online() || locked() !== null
  const empty = () => composer.isEmpty() && context.staged() === 0
  const idle = () => empty() || composer.isStopping() || blocked() || context.sendingAttachments()
  const sendLabel = (): string => {
    const lockedLabel = locked()
    if (lockedLabel !== null) return lockedLabel
    return reachability.online() ? SEND_LABEL : ENGINE_UNREACHABLE_LABEL
  }
  return (
    <Show
      when={composer.isRunning()}
      fallback={
        <ComposerPrimitive.Send
          class={`${TRAILING_BTN} ${idle() ? TRAILING_SEND_IDLE : TRAILING_SEND_ACTIVE}`}
          disabled={blocked()}
          aria-label={sendLabel()}
        >
          Send
          <span class={TRAILING_HINT} aria-hidden="true">
            ⏎
          </span>
        </ComposerPrimitive.Send>
      }
    >
      <ComposerPrimitive.Cancel
        class={`${TRAILING_BTN} ${TRAILING_STOP}`}
        aria-label={composer.isStopping() ? STOPPING_LABEL : STOP_LABEL}
      >
        {composer.isStopping() ? 'Stopping…' : 'Stop'}
        <Show when={!composer.isStopping()}>
          <span class={TRAILING_HINT} aria-hidden="true">
            ^C
          </span>
        </Show>
      </ComposerPrimitive.Cancel>
    </Show>
  )
}

function composerPlaceholder(locked: boolean, running: boolean, queued: boolean, idle: string): string {
  if (locked) return LOCKED_PLACEHOLDER
  if (queued) return 'Queue another instruction…'
  if (running) return 'Add an instruction…'
  return idle
}

function StagedAttachment(props: {component?: Component<{onRemove?: (id: string) => void}>}): JSX.Element {
  const context = useComposerContext()
  const remove = (id: string) => void context.removeAttachment(id)
  return (
    <Show when={props.component} fallback={<AttachmentUI onRemove={remove} />}>
      {(component) => <Dynamic component={component()} onRemove={remove} />}
    </Show>
  )
}

export function PaneComposer(props: PaneComposerProps): JSX.Element {
  let inputHandle: ComposerInputHandle | undefined
  const receiveInputHandle = (handle: ComposerInputHandle): void => {
    inputHandle = handle
    props.onInputReady?.(handle)
  }
  const composer = useComposer()
  const chat = useChatContext()
  const reachability = useEngineReachability()
  const locked = createMemo(() => reachability.locked() !== null)
  const placeholder = createMemo(() =>
    composerPlaceholder(locked(), composer.isRunning(), chat.queue().length > 0, props.placeholder),
  )
  return (
    <ComposerPrimitive.Root
      attachmentAdapter={props.attachmentAdapter}
      draftStorage={props.draftStorage}
      draftWriter={props.draftWriter}
      draftKey={props.draftKey}
      class="flex flex-col relative shrink-0 [background:var(--chat-rail-bg)] [border-block-start:1px_solid_var(--chat-line)]"
    >
      <div class="flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2 pt-2 pb-1 shrink-0 empty:hidden">
        {props.notes}
        <ComposerPrimitive.Attachments component={() => <StagedAttachment component={props.AttachmentComponent} />} />
      </div>
      <div class="flex flex-wrap items-center gap-[10px] min-h-9 pe-2 ps-5">
        <Show
          when={props.prompt}
          fallback={
            <span class={GUTTER} aria-hidden="true">
              ❯
            </span>
          }
        >
          {(prompt) => prompt()}
        </Show>
        <ComposerInputAdapter
          placeholder={placeholder()}
          editableClass={`${INPUT} flex-1 ${locked() ? LOCKED_INPUT : ''}`}
          disabled={locked()}
          inputLabel={props.inputLabel}
          addAttachmentOnPaste={props.attachmentAdapter !== undefined}
          triggers={props.triggers}
          onReady={receiveInputHandle}
          onSelectionChange={props.onSelectionChange}
        />
        <ComposerActionsHost maxInlineAuto={MAX_INLINE_AUTO_ACTIONS} onOverflowDismissed={() => inputHandle?.focus()}>
          <ComposerActions.Trigger>
            <Ellipsis class="size-4 block" aria-hidden="true" />
          </ComposerActions.Trigger>
          <ComposerActions.Leading>
            <Show when={props.attachmentAdapter}>
              <TooltipIconButtonSlot tooltip={ATTACHMENT_LABEL}>
                {(buttonProps) => (
                  <ComposerPrimitive.AddAttachment {...buttonProps()} class={GHOST} disabled={locked()}>
                    <Plus size={16} aria-hidden="true" />
                  </ComposerPrimitive.AddAttachment>
                )}
              </TooltipIconButtonSlot>
            </Show>
          </ComposerActions.Leading>
          <ComposerActions.Trailing>
            <Show when={props.busy} fallback={<ComposerSendControl />}>
              {props.busy}
            </Show>
          </ComposerActions.Trailing>
          {props.children}
        </ComposerActionsHost>
      </div>
    </ComposerPrimitive.Root>
  )
}
