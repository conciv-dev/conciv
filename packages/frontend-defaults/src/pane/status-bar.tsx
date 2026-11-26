import {Show, untrack, type JSX} from 'solid-js'
import {Key} from '@solid-primitives/keyed'
import {TabsPrimitive as Tabs, TruncatedText} from '@conciv/ui-kit-system'
import type {IconName} from '@conciv/frontend-plugin-api'
import {Icon, type SessionStatus, type SessionStatusKind} from '@conciv/ui-kit-chat'
import {viewTabId, viewTabPanelId} from '@internal/frontend-app-api/lib/view-tab-ids'

export type StatusBarView = {
  id: string
  label: string
  icon?: IconName
  content?: () => JSX.Element
  missing?: boolean
}

export type StatusBarProps = {
  status: SessionStatus
  elapsedLabel: string
  diff: {files: number; adds: number; dels: number}
  views: readonly StatusBarView[]
  activeView: string
  onSelectView: (id: string) => void
}

const BAR =
  'flex items-stretch select-none bg-chat-statusbar-bg border-t border-t-solid border-t-chat-line-soft font-chat-mono'
type ChipKind = Exclude<SessionStatusKind, 'unstarted'>
type ChipStatus = SessionStatus & {kind: ChipKind}

const CHIP: Record<ChipKind, string> = {
  running: 'bg-chat-status-running',
  stopping: 'bg-chat-status-waiting',
  waiting: 'bg-chat-status-waiting',
  failed: 'bg-chat-status-failed',
  stopped: 'bg-chat-status-done',
  done: 'bg-chat-status-done',
}
const CHIP_BASE =
  'flex-none flex items-center gap-1.5 px-2.5 text-chat-micro font-bold uppercase tracking-[0.12em] text-chat-on-status'
const CHIP_DOT = 'chat-statusbar-chip-dot flex-none size-1.5 rounded-chat-pill bg-chat-on-status anim-run-ring'
const CELL_BOX = 'flex-none items-center gap-1.5 px-2.5 py-3 text-chat-xs leading-3.75 text-chat-text-2'
const CELL = `flex ${CELL_BOX}`
const DIFF = `hidden @sm:flex ${CELL_BOX} border-s border-s-solid border-s-chat-line-soft`
const DIFF_FILES = 'text-chat-text-3'
const DIFF_ADDS = 'text-chat-success'
const DIFF_DELS = 'text-chat-danger'
const VIEW_GROUP = 'flex-1 flex items-stretch justify-end min-w-0'
const VIEW_LIST = 'relative flex items-stretch min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
const VIEW_BTN =
  'flex-none flex items-center px-2.5 py-3 text-chat-xs leading-3.75 font-medium text-chat-text-2 bg-transparent border-none border-s border-s-solid border-s-chat-line-soft cursor-pointer [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] motion-reduce:[transition:none] hover:bg-chat-fill data-[selected]:text-chat-text-hi data-[selected]:bg-chat-fill'
const VIEW_LINE = 'flex items-baseline gap-1.5 min-w-0'
const VIEW_ICON = 'flex-none self-center size-3'
const VIEW_LABEL = 'hidden @sm:block font-chat truncate max-w-24'
const PLUGIN_LABEL =
  'flex items-baseline gap-1.5 min-w-0 max-w-24 overflow-hidden whitespace-nowrap font-chat [&_svg]:flex-none [&_svg]:self-center [&_svg]:size-3'
const VIEW_HINT = 'font-chat text-chat-hint ps-1.5 border-s border-s-solid border-s-chat-frame-line'
const VIEW_HINT_DIGIT = 'font-chat-mono text-chat-micro'
const VIEW_INDICATOR =
  'chat-view-indicator top-0 h-0.5 bg-chat-accent [width:var(--width)] [left:var(--left)] [--transition-duration:200ms] [--transition-timing-function:var(--chat-ease-expo)] motion-reduce:[--transition-duration:0ms]'

function chipStatus(status: SessionStatus): ChipStatus | undefined {
  if (status.kind === 'unstarted') return undefined
  return {...status, kind: status.kind}
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <div class={BAR} role="toolbar" aria-label="Session status">
      <Show when={chipStatus(props.status)}>
        {(chip) => (
          <span class={`${CHIP_BASE} ${CHIP[chip().kind]}`} role="status" title={chip().reason}>
            <Show when={chip().kind === 'running'}>
              <span class={CHIP_DOT} aria-hidden="true" />
            </Show>
            {chip().label}
          </span>
        )}
      </Show>
      <span class={CELL}>{props.elapsedLabel}</span>
      <Show when={props.diff.files > 0}>
        <span class={DIFF}>
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
          <Key each={props.views} by="id">
            {(view, index) => {
              const content = untrack(view).content
              return (
                <Tabs.Trigger
                  class={VIEW_BTN}
                  value={view().id}
                  aria-label={content ? (view().missing ? view().label : undefined) : view().label}
                >
                  <span class={VIEW_LINE}>
                    <Show when={view().icon}>{(icon) => <Icon name={icon()} class={VIEW_ICON} />}</Show>
                    {content ? (
                      <span class={PLUGIN_LABEL}>{content()}</span>
                    ) : (
                      <TruncatedText class={VIEW_LABEL} text={view().label} />
                    )}
                    <span class={VIEW_HINT} aria-hidden="true">
                      <span class={VIEW_HINT_DIGIT}>{index() + 1}</span>
                    </span>
                  </span>
                </Tabs.Trigger>
              )
            }}
          </Key>
          <Tabs.Indicator class={VIEW_INDICATOR} />
        </Tabs.List>
      </Tabs.Root>
    </div>
  )
}
