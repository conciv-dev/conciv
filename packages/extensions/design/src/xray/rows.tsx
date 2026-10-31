import {For, onMount, Show, type JSX} from 'solid-js'
import {
  badgeColor,
  badgeText,
  rowAboveTolerance,
  rowName,
  rowTitle,
  sourceLabel,
  type BadgeColor,
  type Delta,
  type Row,
} from './data.js'

const BADGE_CLASS: Record<BadgeColor | 'green', string> = {
  orange: 'badge badge-color-orange',
  red: 'badge badge-color-red',
  amber: 'badge badge-color-amber',
  green: 'badge badge-color-green',
}

const BADGE_SLOT = 'ps-12 flex basis-full flex-wrap gap-1 min-w-0 order-last md:ps-0 md:basis-auto md:order-none'

const ROW_FOCUS = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40'

function StatusBadge(props: {row: Row; fixed: boolean}): JSX.Element {
  return (
    <Show
      when={props.row.unmatched}
      fallback={<span class={BADGE_CLASS.green}>{props.fixed ? 'fixed' : 'match'}</span>}
    >
      {(kind) => <span class={BADGE_CLASS.red}>{kind()}</span>}
    </Show>
  )
}

function DeltaBadge(props: {delta: Delta}): JSX.Element {
  return (
    <span role="listitem" class={`${BADGE_CLASS[badgeColor(props.delta)]} transition-colors duration-150`}>
      {badgeText(props.delta)}
    </span>
  )
}

type ComponentRowProps = {
  row: Row
  index: number
  expanded: boolean
  fixed: boolean
  onSelect: (key: string) => void
  children: (row: Row) => JSX.Element
}

function ComponentRow(props: ComponentRowProps): JSX.Element {
  const above = () => rowAboveTolerance(props.row)
  return (
    <li>
      <div
        role={props.expanded ? 'region' : undefined}
        aria-label={props.expanded ? `${rowName(props.row)} component` : undefined}
        class="flex flex-col gap-2"
      >
        <div
          class={`text-sm font-mono px-2 py-1 border border-base rounded flex flex-wrap gap-x-4 gap-y-1 min-w-0 transition items-center relative hover:bg-active ${ROW_FOCUS}  ${props.expanded ? 'bg-active' : ''}  ${above() || props.expanded ? '' : 'op-50 hover:op-75'}`}
        >
          <span class="text-xs color-meta text-end shrink-0 w-8 tabular-nums">#{props.index}</span>
          <button
            type="button"
            aria-expanded={props.expanded}
            class="text-start outline-none flex shrink-0 gap-2 items-center after:content-empty after:inset-0 after:absolute"
            onClick={() => props.onSelect(props.row.key)}
          >
            <span class="i-ph-file-duotone op-75" aria-hidden="true" />
            {rowTitle(props.row)}
          </button>
          <Show when={props.row.source !== null && props.row.selector !== ''}>
            <span class="color-meta flex-1 basis-0 max-w-64 min-w-0 truncate">{props.row.selector}</span>
          </Show>
          <Show
            when={above() && props.row.unmatched === null}
            fallback={
              <span class={BADGE_SLOT}>
                <StatusBadge row={props.row} fixed={props.fixed} />
              </span>
            }
          >
            <span role="list" aria-label="Deltas" class={BADGE_SLOT}>
              <For each={props.row.deltas}>{(delta) => <DeltaBadge delta={delta} />}</For>
            </span>
          </Show>
          <span class="color-meta ms-auto whitespace-nowrap">{sourceLabel(props.row.source)}</span>
          <span
            class={`i-ph-caret-down op-50 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${props.expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
        <Show when={props.expanded}>
          <div ref={(card) => onMount(() => card.scrollIntoView({block: 'nearest'}))}>{props.children(props.row)}</div>
        </Show>
      </div>
    </li>
  )
}

export type ComponentRowsProps = {
  rows: Row[]
  selected: string | null
  fixed: Set<string>
  onSelect: (key: string) => void
  children: (row: Row) => JSX.Element
}

export function ComponentRows(props: ComponentRowsProps): JSX.Element {
  return (
    <ul role="list" aria-label="Components" class="m-0 p-0 pb-16 pt-4 list-none flex flex-col gap-2">
      <For each={props.rows}>
        {(row, index) => (
          <ComponentRow
            row={row}
            index={index()}
            expanded={props.selected === row.key}
            fixed={props.fixed.has(row.key)}
            onSelect={props.onSelect}
          >
            {props.children}
          </ComponentRow>
        )}
      </For>
    </ul>
  )
}

export function AbovePill(props: {above: number; total: number}): JSX.Element {
  return (
    <p class="text-xs m-0 px-3 py-1 border border-base rounded-full bg-glass:80 bottom-4 left-1/2 fixed z-60 -translate-x-1/2">
      <span class="op-fade tabular-nums">
        {props.above} of {props.total} off
      </span>
    </p>
  )
}
