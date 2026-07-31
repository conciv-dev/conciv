import {For, Index, Match, Show, Switch, createSignal, splitProps, type JSX} from 'solid-js'
import {Button, RelativeTime, StatusDot} from '@conciv/ui-kit-system'
import type {LiveSession} from '@conciv/contract'
import {CandidateRow} from './candidate-row.js'
import {
  AS_OF_LAST_CHECK,
  CHECK_AGAIN_LABEL,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  newSessionsLabel,
  NOTHING_RUNNING_HINT,
  nothingRunning,
  OPEN_NEW_LABEL,
  RETRY_LABEL,
  SHOW_NEW_LABEL,
  showAllLabel,
  STALE_NOTICE,
  subtitle,
} from './connect-copy.js'

const COLUMN = 'flex flex-col gap-3 anim-now'
const SUBTITLE = 'text-pw-text-3 text-xs leading-normal m-0'
const SCROLLER = 'flex flex-col gap-3 list-none m-0 p-0 max-h-[26rem] overflow-y-auto -mx-1.5 px-1.5'
const SKELETON = 'flex flex-col gap-3 list-none m-0 p-0'
const SKELETON_ROW = 'min-h-[10.5rem] rounded-pw-md bg-pw-fill-soft anim-skel list-none'
const SKELETON_ROWS = [0, 1]
const WAITING = 'flex items-center gap-2 text-pw-text-3 text-xs m-0'
const CELL = 'flex items-center justify-between gap-2 rounded-pw-sm text-xs p-2 border'
const DANGER = `${CELL} border-pw-danger-line bg-pw-danger-10 text-pw-danger`
const WARN = `${CELL} border-pw-warn-line bg-pw-warn-20 text-pw-warn`
const NEWS = `${CELL} border-pw-line-soft bg-pw-fill-soft text-pw-text-3`
const CELL_TEXT = 'min-w-0 break-words leading-normal'
const EMPTY_TITLE = 'text-pw-text text-sm m-0'
const TOUCH = 'min-h-11 px-3'
const TOUCH_FOCUSED = `${TOUCH} focus-ring-always`

const MAX_ROWS = 8

export function CandidateList(props: {
  sessions: LiveSession[] | undefined
  arrived: number
  harnessName: string
  loading: boolean
  failure: string | null
  stale: boolean
  checkedAt: number
  error: string | null
  connectingId: string | null
  focusRef: (el: HTMLElement) => void
  onPick: (session: LiveSession) => void
  onRetry: () => void
  onRefresh: () => void
  onLaunch: () => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'sessions',
    'arrived',
    'harnessName',
    'loading',
    'failure',
    'stale',
    'checkedAt',
    'error',
    'connectingId',
    'focusRef',
    'onPick',
    'onRetry',
    'onRefresh',
    'onLaunch',
  ])
  const [expanded, setExpanded] = createSignal(false)
  const rows = () => local.sessions ?? []
  const shown = () => (expanded() ? rows() : rows().slice(0, MAX_ROWS))
  const hidden = () => rows().length - shown().length
  const frozen = () => local.failure !== null || local.stale
  const heading = () => {
    const count = rows().length
    const base = subtitle(count, local.harnessName)
    if (base === null) return null
    return frozen() ? `${base} — ${AS_OF_LAST_CHECK}` : base
  }
  return (
    <div class={COLUMN}>
      <Show when={local.error}>
        {(message) => (
          <div class={DANGER} role="alert">
            <span class={CELL_TEXT}>{message()}</span>
            <Button variant="ghost" size="sm" class={`shrink-0 ${TOUCH}`} onClick={() => local.onRetry()}>
              {RETRY_LABEL}
            </Button>
          </div>
        )}
      </Show>
      <Show when={local.arrived > 0}>
        <div class={NEWS}>
          <span class={CELL_TEXT}>{newSessionsLabel(local.arrived)}</span>
          <Button variant="ghost" size="sm" class={`shrink-0 ${TOUCH}`} onClick={() => local.onRefresh()}>
            {SHOW_NEW_LABEL}
          </Button>
        </div>
      </Show>
      <Switch>
        <Match when={local.loading}>
          <p class={WAITING} role="status">
            <StatusDot tone="accent" pulse />
            {LOOKING_LABEL}
          </p>
          <ul class={SKELETON} aria-busy="true" aria-hidden="true">
            <For each={SKELETON_ROWS}>{() => <li class={SKELETON_ROW} />}</For>
          </ul>
        </Match>
        <Match when={local.failure !== null && local.sessions === undefined}>
          <div class={DANGER} role="alert">
            <span class={CELL_TEXT}>
              {LOOKUP_FAILED} {local.failure}
            </span>
            <Button
              ref={(element: HTMLElement) => local.focusRef(element)}
              variant="ghost"
              size="sm"
              class={`shrink-0 ${TOUCH_FOCUSED}`}
              onClick={() => local.onRefresh()}
            >
              {RETRY_LABEL}
            </Button>
          </div>
        </Match>
        <Match when={rows().length === 0}>
          <p class={EMPTY_TITLE} role="status">
            {nothingRunning(local.harnessName)}
          </p>
          <p class={SUBTITLE}>{NOTHING_RUNNING_HINT}</p>
          <div class="flex gap-2">
            <Button
              ref={(element: HTMLElement) => local.focusRef(element)}
              size="sm"
              class={TOUCH_FOCUSED}
              onClick={() => local.onLaunch()}
            >
              {OPEN_NEW_LABEL}
            </Button>
            <Button variant="ghost" size="sm" class={TOUCH} onClick={() => local.onRefresh()}>
              {CHECK_AGAIN_LABEL}
            </Button>
          </div>
        </Match>
        <Match when={rows().length > 0}>
          <Show when={frozen()}>
            <div class={WARN} role="status">
              <span class={CELL_TEXT}>
                {STALE_NOTICE} <RelativeTime value={new Date(local.checkedAt)} />
              </span>
              <Button variant="ghost" size="sm" class={`shrink-0 ${TOUCH}`} onClick={() => local.onRefresh()}>
                {RETRY_LABEL}
              </Button>
            </div>
          </Show>
          <Show when={heading()}>{(text) => <p class={SUBTITLE}>{text()}</p>}</Show>
          <ul class={SCROLLER}>
            <Index each={shown()}>
              {(session, index) => (
                <CandidateRow
                  session={session()}
                  connecting={local.connectingId === session().sessionId}
                  live={!frozen()}
                  focusRef={index === 0 ? local.focusRef : undefined}
                  onPick={local.onPick}
                />
              )}
            </Index>
          </ul>
          <Show when={hidden() > 0}>
            <Button variant="ghost" size="sm" class={`self-start ${TOUCH}`} onClick={() => setExpanded(true)}>
              {showAllLabel(rows().length)}
            </Button>
          </Show>
        </Match>
      </Switch>
    </div>
  )
}
