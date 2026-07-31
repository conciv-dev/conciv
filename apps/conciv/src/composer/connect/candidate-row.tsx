import {For, Match, Show, Switch, createUniqueId, splitProps, type JSX} from 'solid-js'
import {RelativeTime, StatusDot} from '@conciv/ui-kit-system'
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
  'w-full text-start rounded-pw-md border border-pw-line-soft bg-transparent text-pw-text p-3 pb-3.5 flex flex-col gap-2.5 trans-cbb focus-ring-inset-always [contain:layout_paint_style]'
const CARD_IDLE = `${CARD} cursor-pointer hover:border-pw-accent-line hover:bg-pw-fill`
const CARD_BUSY = `${CARD} opacity-70 cursor-progress`
const HEAD = 'flex items-center gap-2 min-w-0 w-full'
const TITLE = 'text-sm font-semibold truncate min-w-0 flex-1'
const META = 'text-pw-text-3 text-xs w-full min-w-0 tabular-nums leading-normal [overflow-wrap:anywhere]'
const NOTE = 'text-pw-warn'
const BADGE =
  'shrink-0 px-1.5 py-0.5 rounded-pw-pill text-[0.625rem] font-medium tracking-wide text-pw-warn bg-pw-warn-20 border border-pw-warn-line'
const CONNECTING = 'flex items-center gap-2 text-pw-accent text-xs'

export function CandidateRow(props: {
  session: LiveSession
  connecting: boolean
  live: boolean
  focusRef?: (el: HTMLElement) => void
  onPick: (session: LiveSession) => void
}): JSX.Element {
  const [local] = splitProps(props, ['session', 'connecting', 'live', 'focusRef', 'onPick'])
  const meta = () => metaLine(local.session)
  const headId = createUniqueId()
  const metaId = createUniqueId()
  const transcriptId = createUniqueId()
  const working = () => local.session.working && local.live
  return (
    <li class="list-none [content-visibility:auto] [contain-intrinsic-size:0_10.5rem]">
      <button
        ref={(element: HTMLElement) => local.focusRef?.(element)}
        type="button"
        class={local.connecting ? CARD_BUSY : CARD_IDLE}
        aria-disabled={local.connecting}
        aria-busy={local.connecting}
        aria-labelledby={`${headId} ${metaId}`}
        aria-describedby={transcriptId}
        onClick={() => {
          if (local.connecting) return
          local.onPick(local.session)
        }}
      >
        <span id={headId} class={HEAD}>
          <StatusDot tone={local.session.working ? 'working' : 'idle'} pulse={working()} />
          <span class={TITLE}>{candidateTitle(local.session)}</span>
          <Show when={!local.session.ready}>
            <span class={BADGE}>{ONE_TIME_SETUP}</span>
          </Show>
        </span>
        <span id={metaId} class={META}>
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
            <StatusDot tone="accent" pulse />
            {CONNECTING_LABEL}
          </span>
        </Show>
        <Switch>
          <Match when={local.session.historyStatus === 'unavailable'}>
            <TranscriptNote id={transcriptId} text={PREVIEW_UNAVAILABLE} />
          </Match>
          <Match when={local.session.tail.length === 0 && !local.session.working}>
            <TranscriptNote id={transcriptId} text={PREVIEW_EMPTY} />
          </Match>
          <Match when={true}>
            <TranscriptTailPreview id={transcriptId} tail={local.session.tail} working={local.session.working} />
          </Match>
        </Switch>
      </button>
    </li>
  )
}
