import {For, Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {RelativeTime} from '@conciv/ui-kit-system'
import type {LiveSession} from '@conciv/contract'
import {TranscriptNote, TranscriptTailPreview} from '../transcript-tail-preview.js'
import {
  candidateTitle,
  CONNECTING_LABEL,
  metaLine,
  ONE_TIME_SETUP,
  PREVIEW_EMPTY,
  PREVIEW_UNAVAILABLE,
} from './connect-copy.js'

const CARD =
  'w-full text-left rounded-pw-md border border-pw-line-soft bg-transparent text-pw-text p-3 pb-3.5 flex flex-col gap-2.5 trans-cbb focus-ring [contain:layout_paint_style]'
const CARD_IDLE = `${CARD} cursor-pointer hover:border-pw-accent-line hover:bg-pw-fill`
const CARD_BUSY = `${CARD} opacity-70 cursor-progress`
const HEAD = 'flex items-center gap-2 min-w-0 w-full'
const TITLE = 'text-sm font-semibold truncate min-w-0'
const META = 'text-pw-text-3 text-xs w-full truncate tabular-nums'
const NOTE = 'text-pw-warn'
const DOT = 'size-1.75 rounded-pw-pill shrink-0'
const DOT_IDLE = `${DOT} bg-pw-text-3`
const DOT_WORKING = `${DOT} bg-pw-success shadow-[0_0_0_0.1875rem_var(--pw-success-15)] anim-pulse`
const DOT_FROZEN = `${DOT} bg-pw-success shadow-[0_0_0_0.1875rem_var(--pw-success-15)]`
const BADGE =
  'shrink-0 ms-auto px-1.5 py-0.5 rounded-pw-pill text-[0.625rem] font-semibold uppercase tracking-wide text-pw-warn bg-pw-warn-20 border border-pw-warn'
const CONNECTING = 'flex items-center gap-2 text-pw-accent text-xs'
const SPINNER = 'size-1.75 rounded-pw-pill bg-pw-accent anim-pulse shrink-0'

function dotClass(session: LiveSession, live: boolean): string {
  if (!session.working) return DOT_IDLE
  return live ? DOT_WORKING : DOT_FROZEN
}

export function CandidateRow(props: {
  session: LiveSession
  connecting: boolean
  live: boolean
  onPick: (session: LiveSession) => void
}): JSX.Element {
  const [local] = splitProps(props, ['session', 'connecting', 'live', 'onPick'])
  const meta = () => metaLine(local.session)
  return (
    <li class="list-none [content-visibility:auto] [contain-intrinsic-size:0_10.5rem]">
      <button
        type="button"
        class={local.connecting ? CARD_BUSY : CARD_IDLE}
        disabled={local.connecting}
        aria-busy={local.connecting}
        onClick={() => local.onPick(local.session)}
      >
        <span class={HEAD}>
          <span class={dotClass(local.session, local.live)} />
          <span class={TITLE}>{candidateTitle(local.session)}</span>
          <Show when={!local.session.ready}>
            <span class={BADGE}>{ONE_TIME_SETUP}</span>
          </Show>
        </span>
        <span class={META}>
          {meta().lead} · {meta().timePrefix} <RelativeTime value={new Date(meta().at)} />
          <For each={meta().notes}>
            {(note) => (
              <span class={NOTE}>
                {' · '}
                {note}
              </span>
            )}
          </For>
        </span>
        <Show when={local.connecting}>
          <span class={CONNECTING} role="status">
            <span class={SPINNER} />
            {CONNECTING_LABEL}
          </span>
        </Show>
        <Switch>
          <Match when={local.session.historyStatus === 'unavailable'}>
            <TranscriptNote text={PREVIEW_UNAVAILABLE} />
          </Match>
          <Match when={local.session.tail.length === 0 && !local.session.working}>
            <TranscriptNote text={PREVIEW_EMPTY} />
          </Match>
          <Match when={true}>
            <TranscriptTailPreview tail={local.session.tail} working={local.session.working} />
          </Match>
        </Switch>
      </button>
    </li>
  )
}
