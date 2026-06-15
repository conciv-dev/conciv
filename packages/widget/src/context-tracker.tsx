import {Show, type JSX} from 'solid-js'
import {HoverCard} from './hover-card.js'
import {contextUsedTokens, type UsageSnapshot} from '@aidx/protocol/usage-types'

const pct = new Intl.NumberFormat('en-US', {style: 'percent', maximumFractionDigits: 1})
const compact = new Intl.NumberFormat('en-US', {notation: 'compact'})
const usd = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const ICON_R = 10
const ICON_VB = 24
const ICON_CENTER = 12
const ICON_SW = 2

function Ring(props: {percent: number}): JSX.Element {
  const circ = 2 * Math.PI * ICON_R
  return (
    <svg
      class="pw-ctx-ring"
      width="16"
      height="16"
      viewBox={`0 0 ${ICON_VB} ${ICON_VB}`}
      role="img"
      aria-label="Model context usage"
    >
      <circle cx={ICON_CENTER} cy={ICON_CENTER} r={ICON_R} fill="none" stroke="currentColor" opacity="0.25" stroke-width={ICON_SW} />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        r={ICON_R}
        fill="none"
        stroke="currentColor"
        opacity="0.7"
        stroke-width={ICON_SW}
        stroke-linecap="round"
        stroke-dasharray={`${circ} ${circ}`}
        stroke-dashoffset={circ * (1 - props.percent)}
        style={{transform: 'rotate(-90deg)', 'transform-origin': 'center'}}
      />
    </svg>
  )
}

function UsageRow(props: {label: string; tokens?: number}): JSX.Element {
  return (
    <Show when={props.tokens}>
      <div class="pw-ctx-row">
        <span class="pw-ctx-row-label">{props.label}</span>
        <span class="pw-ctx-row-val">{compact.format(props.tokens ?? 0)}</span>
      </div>
    </Show>
  )
}

// Per-session top-bar tracker; hidden until the first snapshot, ring when the window is known else a token count.
export function ContextTracker(props: {usage: UsageSnapshot | null}): JSX.Element {
  const used = () => (props.usage ? contextUsedTokens(props.usage) : undefined)
  const maxTokens = () => props.usage?.contextWindow
  const percent = () => {
    const u = used()
    const m = maxTokens()
    return u !== undefined && m ? u / m : undefined
  }
  const hasData = () => used() !== undefined || props.usage?.outputTokens !== undefined

  return (
    <Show when={props.usage && hasData()}>
      <HoverCard
        label="Model context usage"
        class="pw-ctx-card"
        trigger={
          <button type="button" class="pw-ctx-trigger">
            <Show
              when={percent() !== undefined}
              fallback={<span class="pw-ctx-pct">{compact.format(used() ?? props.usage?.outputTokens ?? 0)}</span>}
            >
              <span class="pw-ctx-pct">{pct.format(percent() ?? 0)}</span>
              <Ring percent={percent() ?? 0} />
            </Show>
          </button>
        }
      >
        <Show when={percent() !== undefined}>
          <div class="pw-ctx-head">
            <div class="pw-ctx-head-row">
              <span>{pct.format(percent() ?? 0)}</span>
              <span class="pw-ctx-head-tokens">
                {compact.format(used() ?? 0)} / {compact.format(maxTokens() ?? 0)}
              </span>
            </div>
            <div
              class="pw-ctx-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((percent() ?? 0) * 100)}
            >
              <div class="pw-ctx-bar-fill" style={{width: `${Math.min(100, (percent() ?? 0) * 100)}%`}} />
            </div>
          </div>
        </Show>
        <div class="pw-ctx-body">
          <UsageRow label="Input" tokens={props.usage?.inputTokens} />
          <UsageRow label="Output" tokens={props.usage?.outputTokens} />
          <UsageRow label="Cache" tokens={props.usage?.cacheReadTokens} />
          <UsageRow label="Reasoning" tokens={props.usage?.reasoningTokens} />
        </div>
        <Show when={props.usage?.totalCostUsd !== undefined || props.usage?.numTurns !== undefined}>
          <div class="pw-ctx-foot">
            <Show when={props.usage?.totalCostUsd !== undefined}>
              <div class="pw-ctx-row">
                <span class="pw-ctx-row-label">Total cost</span>
                <span>{usd.format(props.usage?.totalCostUsd ?? 0)}</span>
              </div>
            </Show>
            <Show when={props.usage?.numTurns !== undefined}>
              <div class="pw-ctx-row">
                <span class="pw-ctx-row-label">Turns</span>
                <span>{props.usage?.numTurns}</span>
              </div>
            </Show>
          </div>
        </Show>
      </HoverCard>
    </Show>
  )
}
