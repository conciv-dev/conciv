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
        <span class="text-chat-text-2">{props.label}</span>
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
      <div class="p-3 border-b border-b-chat-line-soft">
        <div class="text-xs mb-2 flex justify-between">
          <span>{pct.format(props.percent ?? 0)}</span>
          <span class="text-chat-text-2 font-chat-mono">
            {compact.format(props.used)} / {compact.format(props.max)}
          </span>
        </div>
        <div
          class="rounded-full bg-chat-fill-soft h-1.5 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((props.percent ?? 0) * 100)}
        >
          <div class="bg-chat-accent h-full" style={{width: `${Math.min(100, (props.percent ?? 0) * 100)}%`}} />
        </div>
      </div>
    </Show>
  )
}

const CostRow = (props: {value?: number}): JSX.Element => (
  <Show when={props.value !== undefined}>
    <div class="text-xs flex justify-between">
      <span class="text-chat-text-2">Total cost</span>
      <span>{usd.format(props.value ?? 0)}</span>
    </div>
  </Show>
)

const TurnsRow = (props: {value?: number}): JSX.Element => (
  <Show when={props.value !== undefined}>
    <div class="text-xs flex justify-between">
      <span class="text-chat-text-2">Turns</span>
      <span>{props.value}</span>
    </div>
  </Show>
)

function CostFooter(props: {totalCostUsd?: number; numTurns?: number}): JSX.Element {
  return (
    <Show when={props.totalCostUsd !== undefined || props.numTurns !== undefined}>
      <div class="p-3 border-t border-t-chat-line-soft bg-chat-panel-sunk flex flex-col gap-1.5">
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

function deriveContext(usage: UsageSnapshot | null) {
  const used = usage ? contextUsedTokens(usage) : undefined
  const maxTokens = usage?.contextWindow
  const percent = used !== undefined && maxTokens ? used / maxTokens : undefined
  const hasData = used !== undefined || (usage ? billingTokens(usage) > 0 : false)
  return {used, maxTokens, percent, hasData}
}

export function ContextTracker(props: {usage: UsageSnapshot | null}): JSX.Element {
  const derived = () => deriveContext(props.usage)

  return (
    <Show when={props.usage && derived().hasData}>
      <HoverCard
        label="Model context usage"
        triggerClass="text-chat-text-2 px-1.5 py-0.5 rounded-chat-surface-sm inline-flex gap-1.5 cursor-pointer items-center hover:text-chat-text-hi hover:bg-chat-fill-soft"
        trigger={
          <TrackerBadge percent={derived().percent} fallbackTokens={props.usage ? billingTokens(props.usage) : 0} />
        }
      >
        <ContextMeter percent={derived().percent} used={derived().used ?? 0} max={derived().maxTokens ?? 0} />
        <div class="p-3 flex flex-col gap-1.5">
          <UsageRow label="Input" tokens={props.usage?.inputTokens} />
          <UsageRow label="Output" tokens={props.usage?.outputTokens} />
          <UsageRow label="Cache read" tokens={props.usage?.cacheReadTokens} />
          <UsageRow label="Cache write" tokens={props.usage?.cacheWriteTokens} />
          <UsageRow label="Reasoning" tokens={props.usage?.reasoningTokens} />
        </div>
        <CostFooter totalCostUsd={props.usage?.totalCostUsd} numTurns={props.usage?.numTurns} />
      </HoverCard>
    </Show>
  )
}

const SUMMARY_ROOT = 'flex flex-col gap-2 px-1 py-1'
const SUMMARY_HEADLINE =
  '[font-family:var(--chat-mono)] text-[11px] [color:var(--chat-text-2)] flex items-baseline gap-1.5 [font-variant-numeric:tabular-nums]'
const SUMMARY_BAR_TRACK = 'h-1 rounded-[var(--chat-radius-pill)] overflow-hidden [background:var(--chat-fill)]'
const SUMMARY_BAR_FILL = 'h-full [background:var(--chat-accent)]'
const SUMMARY_SEPARATOR = 'h-px [background:var(--chat-line-soft)]'
const SUMMARY_ROW = 'flex justify-between items-baseline gap-2 text-[11px]'
const SUMMARY_LABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.1em] [color:var(--chat-microlabel)]'
const SUMMARY_VALUE = '[color:var(--chat-text-2)] [font-variant-numeric:tabular-nums]'
const SUMMARY_COST_VALUE = '[color:var(--chat-text-hi)] font-semibold [font-variant-numeric:tabular-nums]'

function SummaryRow(props: {label: string; tokens?: number}): JSX.Element {
  return (
    <Show when={props.tokens}>
      <div class={SUMMARY_ROW}>
        <span class={SUMMARY_LABEL}>{props.label}</span>
        <span class={SUMMARY_VALUE}>{compact.format(props.tokens ?? 0)}</span>
      </div>
    </Show>
  )
}

export function ContextSummary(props: {usage: UsageSnapshot | null}): JSX.Element {
  const derived = () => deriveContext(props.usage)

  return (
    <Show when={props.usage && derived().hasData}>
      <div class={SUMMARY_ROOT}>
        <Show when={derived().percent !== undefined}>
          <div class={SUMMARY_HEADLINE}>
            <span>{pct.format(derived().percent ?? 0)}</span>
            <span class="[color:var(--chat-separator)]">·</span>
            <span>
              {compact.format(derived().used ?? 0)} / {compact.format(derived().maxTokens ?? 0)}
            </span>
          </div>
          <div
            class={SUMMARY_BAR_TRACK}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((derived().percent ?? 0) * 100)}
            aria-label="Model context usage"
          >
            <div class={SUMMARY_BAR_FILL} style={{width: `${Math.min(100, (derived().percent ?? 0) * 100)}%`}} />
          </div>
        </Show>
        <SummaryRow label="Input" tokens={props.usage?.inputTokens} />
        <SummaryRow label="Output" tokens={props.usage?.outputTokens} />
        <SummaryRow label="Cache read" tokens={props.usage?.cacheReadTokens} />
        <SummaryRow label="Cache write" tokens={props.usage?.cacheWriteTokens} />
        <Show when={props.usage?.totalCostUsd !== undefined}>
          <div class={SUMMARY_SEPARATOR} />
          <div class={SUMMARY_ROW}>
            <span class={SUMMARY_LABEL}>Total cost</span>
            <span class={SUMMARY_COST_VALUE}>{usd.format(props.usage?.totalCostUsd ?? 0)}</span>
          </div>
        </Show>
      </div>
    </Show>
  )
}
