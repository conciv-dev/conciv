import {For, Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Button, RelativeTime} from '@conciv/ui-kit-system'
import type {LiveSession} from '@conciv/contract'
import {CandidateRow} from './candidate-row.js'
import {orderCandidates} from './connect-steps.js'
import {
  AS_OF_LAST_CHECK,
  CHECK_AGAIN_LABEL,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  NOTHING_RUNNING_HINT,
  nothingRunning,
  OPEN_NEW_LABEL,
  RETRY_LABEL,
  STALE_NOTICE,
  subtitle,
} from './connect-copy.js'

const COLUMN = 'flex flex-col gap-3'
const SUBTITLE = 'text-pw-text-3 text-xs leading-normal m-0'
const SCROLLER = 'flex flex-col gap-3 list-none m-0 p-0 max-h-[26rem] overflow-y-auto -mx-1.5 px-1.5'
const SKELETON = 'flex flex-col gap-3 list-none m-0 p-0'
const SKELETON_ROW = 'min-h-[10.5rem] rounded-pw-md bg-pw-fill-soft anim-skel list-none'
const SKELETON_ROWS = [0, 1]
const WAITING = 'flex items-center gap-2 text-pw-text-3 text-xs m-0'
const SPINNER = 'size-1.75 rounded-pw-pill bg-pw-accent anim-pulse shrink-0'
const CELL = 'flex items-start justify-between gap-2 rounded-pw-sm text-xs p-2'
const DANGER = `${CELL} border border-pw-danger-line bg-pw-danger-10 text-pw-danger`
const WARN = `${CELL} border border-pw-warn bg-pw-warn-20 text-pw-warn`
const CELL_TEXT = 'min-w-0 break-words leading-normal'
const EMPTY_TITLE = 'text-pw-text text-sm m-0'

const MAX_ROWS = 8

export function CandidateList(props: {
  sessions: LiveSession[] | undefined
  harnessName: string
  loading: boolean
  failure: string | null
  stale: boolean
  checkedAt: number
  error: string | null
  connectingId: string | null
  onPick: (session: LiveSession) => void
  onRetry: () => void
  onRefresh: () => void
  onLaunch: () => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'sessions',
    'harnessName',
    'loading',
    'failure',
    'stale',
    'checkedAt',
    'error',
    'connectingId',
    'onPick',
    'onRetry',
    'onRefresh',
    'onLaunch',
  ])
  const rows = () => orderCandidates(local.sessions ?? [])
  const shown = () => rows().slice(0, MAX_ROWS)
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
            <Button variant="ghost" size="sm" class="shrink-0" onClick={() => local.onRetry()}>
              {RETRY_LABEL}
            </Button>
          </div>
        )}
      </Show>
      <Switch>
        <Match when={local.loading}>
          <p class={WAITING} role="status">
            <span class={SPINNER} />
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
            <Button variant="ghost" size="sm" class="shrink-0" onClick={() => local.onRefresh()}>
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
            <Button size="sm" onClick={() => local.onLaunch()}>
              {OPEN_NEW_LABEL}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => local.onRefresh()}>
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
              <Button variant="ghost" size="sm" class="shrink-0" onClick={() => local.onRefresh()}>
                {RETRY_LABEL}
              </Button>
            </div>
          </Show>
          <Show when={heading()}>{(text) => <p class={SUBTITLE}>{text()}</p>}</Show>
          <ul class={SCROLLER}>
            <For each={shown()}>
              {(session) => (
                <CandidateRow
                  session={session}
                  connecting={local.connectingId === session.sessionId}
                  live={!frozen()}
                  onPick={local.onPick}
                />
              )}
            </For>
          </ul>
          <Show when={hidden() > 0}>
            <p class={SUBTITLE}>{`${hidden()} more session${hidden() === 1 ? '' : 's'} are not shown.`}</p>
          </Show>
        </Match>
      </Switch>
    </div>
  )
}
