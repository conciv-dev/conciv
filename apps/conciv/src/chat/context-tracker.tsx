import {Show, type JSX} from 'solid-js'
import {HoverCard} from '@conciv/ui-kit-system'
import {contextUsedTokens, type UsageSnapshot} from '@conciv/protocol/usage-types'

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
      class="block"
      width="16"
      height="16"
      viewBox={`0 0 ${ICON_VB} ${ICON_VB}`}
      role="img"
      aria-label="Model context usage"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        r={ICON_R}
        fill="none"
        stroke="currentColor"
        opacity="0.25"
        stroke-width={ICON_SW}
      />
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
      <div class="text-xs flex justify-between">
        <span class="text-pw-text-2">{props.label}</span>
        <span>{compact.format(props.tokens ?? 0)}</span>
      </div>
    </Show>
  )
}

function TrackerBadge(props: {percent?: number; fallbackTokens: number}): JSX.Element {
  return (
    <Show
      when={props.percent !== undefined}
      fallback={<span class="text-xs [font-variant-numeric:tabular-nums]">{compact.format(props.fallbackTokens)}</span>}
    >
      <span class="text-xs [font-variant-numeric:tabular-nums]">{pct.format(props.percent ?? 0)}</span>
      <Ring percent={props.percent ?? 0} />
    </Show>
  )
}

function ContextMeter(props: {percent?: number; used: number; max: number}): JSX.Element {
  return (
    <Show when={props.percent !== undefined}>
      <div class="p-3 border-b border-b-pw-line-soft">
        <div class="text-xs mb-2 flex justify-between">
          <span>{pct.format(props.percent ?? 0)}</span>
          <span class="text-pw-text-2 font-pw-mono">
            {compact.format(props.used)} / {compact.format(props.max)}
          </span>
        </div>
        <div
          class="rounded-full bg-pw-fill-soft h-1.5 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((props.percent ?? 0) * 100)}
        >
          <div class="bg-pw-accent h-full" style={{width: `${Math.min(100, (props.percent ?? 0) * 100)}%`}} />
        </div>
      </div>
    </Show>
  )
}

const CostRow = (props: {value?: number}): JSX.Element => (
  <Show when={props.value !== undefined}>
    <div class="text-xs flex justify-between">
      <span class="text-pw-text-2">Total cost</span>
      <span>{usd.format(props.value ?? 0)}</span>
    </div>
  </Show>
)

const TurnsRow = (props: {value?: number}): JSX.Element => (
  <Show when={props.value !== undefined}>
    <div class="text-xs flex justify-between">
      <span class="text-pw-text-2">Turns</span>
      <span>{props.value}</span>
    </div>
  </Show>
)

function CostFooter(props: {totalCostUsd?: number; numTurns?: number}): JSX.Element {
  return (
    <Show when={props.totalCostUsd !== undefined || props.numTurns !== undefined}>
      <div class="p-3 border-t border-t-pw-line-soft bg-pw-panel-sunk flex flex-col gap-1.5">
        <CostRow value={props.totalCostUsd} />
        <TurnsRow value={props.numTurns} />
      </div>
    </Show>
  )
}

function billingTokens(usage: UsageSnapshot): number {
  return (
    (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  )
}

export function ContextTracker(props: {usage: UsageSnapshot | null}): JSX.Element {
  const used = () => (props.usage ? contextUsedTokens(props.usage) : undefined)
  const maxTokens = () => props.usage?.contextWindow
  const percent = () => {
    const u = used()
    const m = maxTokens()
    return u !== undefined && m ? u / m : undefined
  }
  const hasData = () => used() !== undefined || (props.usage ? billingTokens(props.usage) > 0 : false)

  return (
    <Show when={props.usage && hasData()}>
      <HoverCard
        label="Model context usage"
        triggerClass="text-pw-text-2 px-1.5 py-0.5 rounded-pw-sm inline-flex gap-1.5 cursor-pointer items-center hover:text-pw-text-hi hover:bg-pw-fill-soft"
        trigger={<TrackerBadge percent={percent()} fallbackTokens={props.usage ? billingTokens(props.usage) : 0} />}
      >
        <ContextMeter percent={percent()} used={used() ?? 0} max={maxTokens() ?? 0} />
        <div class="p-3 flex flex-col gap-1.5">
          <UsageRow label="Input" tokens={props.usage?.inputTokens} />
          <UsageRow label="Output" tokens={props.usage?.outputTokens} />
          <UsageRow label="Cache" tokens={props.usage?.cacheReadTokens} />
          <UsageRow label="Reasoning" tokens={props.usage?.reasoningTokens} />
        </div>
        <CostFooter totalCostUsd={props.usage?.totalCostUsd} numTurns={props.usage?.numTurns} />
      </HoverCard>
    </Show>
  )
}
