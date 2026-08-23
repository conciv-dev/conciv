import {For, Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {SessionStatus, SessionStatusKind} from '@conciv/ui-kit-chat'

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
  'flex-none inline-flex items-center py-[5px] px-2.5 text-[length:var(--chat-text-micro)] font-bold uppercase tracking-[0.12em] [color:var(--chat-on-status)]'
const CELL =
  'flex-none inline-flex items-center gap-1.5 py-[5px] px-[9px] text-[10.5px] [color:var(--chat-text-2)] [border-inline-end:1px_solid_var(--chat-line-soft)]'
const DIFF_FILES = '[color:var(--chat-text-3)]'
const DIFF_ADDS = '[color:var(--chat-success)]'
const DIFF_DELS = '[color:var(--chat-danger)]'
const VIEW_GROUP = 'flex-1 flex items-stretch justify-end min-w-0'
const VIEW_BTN =
  'flex-none inline-flex items-center gap-1.5 px-2.5 text-[length:var(--chat-text-xs)] font-medium [color:var(--chat-text-2)] bg-transparent [border-block:none] [border-inline-end:none] [border-inline-start:1px_solid_var(--chat-line-soft)] cursor-pointer [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[color:var(--chat-text-hi)] disabled:opacity-40 disabled:cursor-default'
const VIEW_BTN_ACTIVE = '[color:var(--chat-text-hi)]'
const VIEW_HINT =
  'chat-view-btn-hint [font-family:var(--chat-mono)] text-[9px] [color:var(--chat-hint)] ps-[9px] [border-inline-start:1px_solid_var(--chat-frame-line)]'
const VIEW_LABEL = 'chat-view-btn-label [font-family:var(--chat-font)] truncate max-w-24'

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <div class={BAR} role="toolbar" aria-label="Session status">
      <span class={`${CHIP_BASE} ${CHIP[props.status.kind]}`} role="status" title={props.status.reason}>
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
      <span class={VIEW_GROUP}>
        <For each={props.views}>
          {(view, index) => (
            <button
              type="button"
              class={`${VIEW_BTN} ${props.activeView === view.id ? VIEW_BTN_ACTIVE : ''}`}
              disabled={props.disabled && view.id !== props.activeView}
              aria-pressed={props.activeView === view.id}
              aria-label={view.label}
              onClick={() => props.onSelectView(view.id)}
            >
              <Show when={view.icon}>{(icon) => <Dynamic component={icon()} class="size-3" aria-hidden="true" />}</Show>
              <span class={VIEW_LABEL}>{view.label}</span>
              <span class={VIEW_HINT} aria-hidden="true">
                {index() + 1}
              </span>
            </button>
          )}
        </For>
      </span>
    </div>
  )
}
