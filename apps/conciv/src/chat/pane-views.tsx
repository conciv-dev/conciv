import {For, Show, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {
  AttachmentByMime,
  Composer,
  ComposerPrimitive,
  NowLine,
  Thread,
  type AttachmentAdapter,
  type AttachmentCardSlot,
  type Turn,
} from '@conciv/ui-kit-chat'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {Grab} from '@conciv/grab'
import type {MarkerRow} from '@conciv/contract'
import {useInstances} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {NoticeToaster} from '../shell/notices.js'
import {ComposerActions} from '../composer/actions.js'
import {SessionModelSelector} from '../composer/model-selector.js'
import {ComposerStateBridge, type ComposerStateApi} from './composer-state.js'
import {GrabReference} from './grab-reference.js'
import {CompactSpinner, Divider, ThinkingBubble} from './indicators.js'
import {ToolFallbackCard} from './tool-fallback-card.js'
import {TriggerMenus} from './trigger-menus.js'

const GRAB_PREVIEW_MAX_W = 280

const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem] anim-msg'
const RECONNECT = 'flex gap-2 items-center text-pw-text-2 text-[0.75rem] anim-msg'
const RETRY = 'shrink-0 min-h-8 font-semibold'
const DOT = 'w-1.5 h-1.5 rounded-[50%] bg-pw-text-2'

export type PaneAttachments = {cards: AttachmentCardSlot[]; adapter: AttachmentAdapter}

export type ThreadViewProps = {
  tools: ToolCardEntry[]
  attachmentCards: readonly AttachmentCardSlot[]
  dividersInRange: (start: number, end: number) => MarkerRow[]
  footerDividers: MarkerRow[]
  compacting: boolean
  thinking: boolean
  nowTitle: string | null
  error: Error | undefined
  viewportRef: (element: HTMLElement) => void
  onStop: () => void
  onRetry: () => void
  onStarter: (text: string) => void
  composer: JSX.Element
}

export type ComposerViewProps = {
  sessionId: string
  disconnected: boolean
  compacting: boolean
  attachments: PaneAttachments
  inputRef: (element: HTMLTextAreaElement) => void
  onCompact: () => void
  onNewSession: () => void
  onStageGrab: (grab: Grab) => void
  onComposerReady: (api: ComposerStateApi) => void
}

function resetSlideOnSelf(reset: () => void): (event: AnimationEvent) => void {
  return (event) => {
    if (event.target === event.currentTarget) reset()
  }
}

export function PaneFrame(props: {children: JSX.Element}): JSX.Element {
  const instances = useInstances()
  const pane = usePane()
  return (
    <ComposerPrimitive.TriggerPopoverRoot>
      <ExtensionSurface name="header" instances={instances} />
      <ExtensionSurface name="widget" instances={instances} />
      <div
        onAnimationEnd={resetSlideOnSelf(pane.resetSlide)}
        class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
      >
        {props.children}
      </div>
    </ComposerPrimitive.TriggerPopoverRoot>
  )
}

function renderDivider(row: MarkerRow): JSX.Element {
  return <Divider kind={row.kind} />
}

function busySlot(compacting: boolean): JSX.Element | undefined {
  if (!compacting) return undefined
  return <CompactSpinner />
}

export function ThreadView(props: ThreadViewProps): JSX.Element {
  const instances = useInstances()
  const turnPrefix = (turn: Turn): JSX.Element => (
    <For each={props.dividersInRange(turn.start, turn.end)}>{renderDivider}</For>
  )
  return (
    <Thread
      tools={props.tools}
      attachmentCards={props.attachmentCards}
      components={{ToolFallback: ToolFallbackCard}}
      turnPrefix={turnPrefix}
      viewportRef={props.viewportRef}
      viewportFooter={
        <>
          <For each={props.footerDividers}>{renderDivider}</For>
          <Show when={props.compacting}>
            <Divider kind="compact" pending />
          </Show>
          <Show when={props.thinking}>
            <ThinkingBubble />
          </Show>
          <Show when={props.nowTitle}>{(title) => <NowLine title={title()} onStop={() => props.onStop()} />}</Show>
          <Show when={props.error}>
            {(error) => (
              <div class={ERROR} role="alert">
                <span class="flex-1">{error().message}</span>
                <Button variant="danger" size="sm" class={RETRY} onClick={() => props.onRetry()}>
                  Retry
                </Button>
              </div>
            )}
          </Show>
        </>
      }
      welcome={<EmptyStateSlot onStarter={(starter) => props.onStarter(starter)} instances={instances} />}
      notices={<NoticeToaster />}
      composer={props.composer}
    />
  )
}

export function ComposerView(props: ComposerViewProps): JSX.Element {
  const instances = useInstances()
  const pane = usePane()
  const PaneAttachment = (slotProps: {removable?: boolean}): JSX.Element => (
    <AttachmentByMime cards={props.attachments.cards} removable={slotProps.removable} />
  )
  return (
    <>
      <ExtensionSurface name="status" instances={instances} />
      <ExtensionSurface name="footer" instances={instances} />
      <Show when={props.disconnected}>
        <div class={RECONNECT} aria-hidden="true">
          <span class={`${DOT} anim-dot1`} />
          <span class="flex-1">Reconnecting…</span>
        </div>
      </Show>
      <For each={pane.grabStore.grabs()}>
        {(grab) => (
          <GrabReference grab={grab} maxWidth={GRAB_PREVIEW_MAX_W} onRemove={() => pane.grabStore.remove(grab)} />
        )}
      </For>
      <Composer
        placeholder="Ask a question…"
        inputLabel="Message the conciv agent"
        attachmentAdapter={props.attachments.adapter}
        AttachmentComponent={PaneAttachment}
        inputRef={props.inputRef}
        busy={busySlot(props.compacting)}
        popover={<TriggerMenus sessionId={props.sessionId} />}
      >
        <ComposerActions
          sessionId={props.sessionId}
          compacting={props.compacting}
          onCompact={() => props.onCompact()}
          onNewSession={() => props.onNewSession()}
          onStageGrab={(grab) => props.onStageGrab(grab)}
        />
        <ExtensionSurface name="composer" instances={instances} />
        <SessionModelSelector sessionId={props.sessionId} />
        <ComposerStateBridge onReady={props.onComposerReady} />
      </Composer>
    </>
  )
}
