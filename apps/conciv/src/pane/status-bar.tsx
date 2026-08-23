import {For, Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {TabsPrimitive as Tabs} from '@conciv/ui-kit-system'
import type {SessionStatus, SessionStatusKind} from '@conciv/ui-kit-chat'
import {viewTabId, viewTabPanelId} from './view-tab-ids.js'

export type StatusBarView = {id: string; label: string; icon?: Component<{class?: string}>}

export type StatusBarProps = {
  status: SessionStatus
  elapsedLabel: string
  diff: {files: number; adds: number; dels: number}
  views: readonly StatusBarView[]
  activeView: string
  onSelectView: (id: string) => void
  disabled: boolean
}

const BAR =
  'flex items-stretch min-h-8 [background:var(--chat-statusbar-bg)] [border-top:1px_solid_var(--chat-line-soft)] [font-family:var(--chat-mono)]'
const CHIP: Record<SessionStatusKind, string> = {
  running: '[background:var(--chat-status-running)]',
  stopping: '[background:var(--chat-status-waiting)]',
  waiting: '[background:var(--chat-status-waiting)]',
  failed: '[background:var(--chat-status-failed)]',
  done: '[background:var(--chat-status-done)]',
}
const CHIP_BASE =
  'flex-none inline-flex items-center gap-1.5 py-[5px] px-2.5 text-[length:var(--chat-text-micro)] font-bold uppercase tracking-[0.12em] [color:var(--chat-on-status)]'
const CHIP_DOT =
  'chat-statusbar-chip-dot inline-block flex-none size-1.5 rounded-[var(--chat-radius-pill)] [background:var(--chat-on-status)] anim-run-ring'
const CELL =
  'flex-none inline-flex items-center gap-1.5 py-[5px] px-[9px] text-[10.5px] [color:var(--chat-text-2)] [border-inline-end:1px_solid_var(--chat-line-soft)]'
const DIFF_FILES = '[color:var(--chat-text-3)]'
const DIFF_ADDS = '[color:var(--chat-success)]'
const DIFF_DELS = '[color:var(--chat-danger)]'
const VIEW_GROUP = 'flex-1 flex items-stretch justify-end min-w-0'
const VIEW_LIST = 'relative flex items-stretch min-w-0'
const VIEW_BTN =
  'flex-none inline-flex items-center gap-1.5 px-2.5 text-[length:var(--chat-text-xs)] font-medium [color:var(--chat-text-2)] bg-transparent [border-block:none] [border-inline-end:none] [border-inline-start:1px_solid_var(--chat-line-soft)] cursor-pointer [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] motion-reduce:[transition:none] hover:[background:var(--chat-fill)] disabled:opacity-40 disabled:cursor-default data-[selected]:[color:var(--chat-text-hi)] data-[selected]:[background:var(--chat-fill)]'
const VIEW_INDICATOR =
  'chat-view-indicator top-0 h-0.5 [background:var(--chat-accent)] [width:var(--width)] [left:var(--left)] [--transition-duration:200ms] [--transition-timing-function:var(--chat-ease-expo)] motion-reduce:[--transition-duration:0ms]'
const VIEW_HINT =
  'chat-view-btn-hint [font-family:var(--chat-mono)] text-[9px] [color:var(--chat-hint)] ps-[9px] [border-inline-start:1px_solid_var(--chat-frame-line)]'
const VIEW_LABEL = 'chat-view-btn-label [font-family:var(--chat-font)] truncate max-w-24'

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <div class={BAR} role="toolbar" aria-label="Session status">
      <span class={`${CHIP_BASE} ${CHIP[props.status.kind]}`} role="status" title={props.status.reason}>
        <Show when={props.status.kind === 'running'}>
          <span class={CHIP_DOT} aria-hidden="true" />
        </Show>
        {props.status.label}
      </span>
      <span class={CELL}>
        <span>{props.elapsedLabel}</span>
      </span>
      <Show when={props.diff.files > 0}>
        <span class={`${CELL} chat-statusbar-diff`}>
          <span class={DIFF_FILES}>
            {props.diff.files} {props.diff.files === 1 ? 'file' : 'files'}
          </span>
          <span class={DIFF_ADDS}>+{props.diff.adds}</span>
          <span class={DIFF_DELS}>−{props.diff.dels}</span>
        </span>
      </Show>
      <Tabs.Root
        class={VIEW_GROUP}
        value={props.activeView}
        onValueChange={(details) => props.onSelectView(details.value)}
        activationMode="manual"
        ids={{trigger: viewTabId, content: viewTabPanelId}}
      >
        <Tabs.List class={VIEW_LIST}>
          <For each={props.views}>
            {(view, index) => (
              <Tabs.Trigger
                class={VIEW_BTN}
                value={view.id}
                disabled={props.disabled && view.id !== props.activeView}
                aria-label={view.label}
              >
                <Show when={view.icon}>
                  {(icon) => <Dynamic component={icon()} class="size-3" aria-hidden="true" />}
                </Show>
                <span class={VIEW_LABEL}>{view.label}</span>
                <span class={VIEW_HINT} aria-hidden="true">
                  {index() + 1}
                </span>
              </Tabs.Trigger>
            )}
          </For>
          <Tabs.Indicator class={VIEW_INDICATOR} />
        </Tabs.List>
      </Tabs.Root>
    </div>
  )
}
