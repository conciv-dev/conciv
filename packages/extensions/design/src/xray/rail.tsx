import {createEffect, For, on, Show, type JSX} from 'solid-js'
import {
  Button,
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_MESSAGE,
  ScrollArea,
  SegmentGroup,
  TextField,
  type StatusDotTone,
} from '@conciv/ui-kit-system'
import {rowAboveTolerance, type Row} from './data.js'

export const FILTERS = ['all', 'above', 'unmatched'] as const
export type Filter = (typeof FILTERS)[number]

const FILTER_LABEL: Record<Filter, string> = {all: 'All', above: 'Above', unmatched: 'Unmatched'}

const BAR: Record<StatusDotTone, string> = {
  idle: 'bg-chat-text-3',
  working: 'bg-chat-success',
  accent: 'bg-chat-accent',
  success: 'bg-chat-success',
  warn: 'bg-chat-warn',
  danger: 'bg-chat-danger',
}

const ROW =
  'w-full min-h-8 grid grid-cols-[3px_minmax(0,1fr)_auto] gap-x-2.5 py-1.25 ps-2.5 pe-3 rounded-chat-surface-sm text-left cursor-pointer select-none trans-btn hover:bg-chat-fill-strong aria-[current=true]:bg-chat-accent-08 aria-[current=true]:[box-shadow:inset_0_0_0_1px_var(--chat-accent-line)] focus-ring'

const PERCENT = new Intl.NumberFormat(undefined, {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2})

export function percent(value: number): string {
  return PERCENT.format(value)
}

function rowSummary(row: Row): string {
  if (row.unmatched === 'extra') return 'extra · not in the target'
  if (row.unmatched === 'missing') return 'missing · in the target, not rendered'
  if (row.deltas.length === 0) return 'matches within tolerance'
  return row.deltas.map((delta) => `${delta.kind} ${delta.live} → ${delta.target}`).join(' · ')
}

export function filterRows(input: {rows: Row[]; filter: Filter; query: string}): Row[] {
  const needle = input.query.trim().toLowerCase()
  return input.rows
    .filter((row) => input.filter !== 'above' || rowAboveTolerance(row))
    .filter((row) => input.filter !== 'unmatched' || row.unmatched !== null)
    .filter((row) => needle === '' || `${row.label} ${row.selector}`.toLowerCase().includes(needle))
}

type RailProps = {
  rows: Row[]
  visible: Row[]
  selected: string | null
  filter: Filter
  query: string
  ran: boolean
  onFilter: (filter: Filter) => void
  onQuery: (query: string) => void
  onSelect: (row: Row) => void
  runAction: JSX.Element
}

function RailRow(props: {row: Row; selected: boolean; onSelect: (row: Row) => void}): JSX.Element {
  const ref: {button?: HTMLButtonElement} = {}
  createEffect(
    on(
      () => props.selected,
      (selected) => {
        if (selected) ref.button?.scrollIntoView({block: 'nearest'})
      },
    ),
  )
  return (
    <li>
      <Button
        ref={(button) => {
          ref.button = button
        }}
        variant="plain"
        size="none"
        class={ROW}
        aria-current={props.selected ? 'true' : undefined}
        onClick={() => props.onSelect(props.row)}
      >
        <span class={`rounded-sm row-span-2 ${BAR[props.row.tone]}`} aria-hidden="true" />
        <span class="text-[0.75rem] text-chat-text font-chat-mono font-medium truncate">{props.row.label}</span>
        <span
          class={`text-[0.75rem] font-chat-mono tabular-nums ${props.row.tone === 'danger' ? 'text-chat-danger' : 'text-chat-text-2'}`}
        >
          {props.row.mismatch === null ? (props.row.unmatched ?? '') : percent(props.row.mismatch)}
        </span>
        <span class="text-[0.75rem] text-chat-text-3 leading-tight col-span-2 col-start-2 truncate">
          {rowSummary(props.row)}
        </span>
      </Button>
    </li>
  )
}

export function Rail(props: RailProps): JSX.Element {
  const count = (filter: Filter) => filterRows({rows: props.rows, filter, query: ''}).length
  return (
    <nav aria-label="components" class="border-r border-chat-line bg-chat-panel flex flex-col min-h-0">
      <div class="px-3 pb-1 pt-2.5 border-b border-chat-line flex flex-col gap-2">
        <TextField
          aria-label="filter"
          placeholder="filter by file or selector"
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <SegmentGroup.Root
          aria-label="show"
          orientation="horizontal"
          class="w-full"
          value={props.filter}
          onValueChange={(details) => {
            const next = FILTERS.find((filter) => filter === details.value)
            if (next !== undefined) props.onFilter(next)
          }}
        >
          <SegmentGroup.Indicator />
          <For each={FILTERS}>
            {(filter) => (
              <SegmentGroup.Item value={filter} class="flex-1 justify-center">
                <SegmentGroup.ItemText>
                  {FILTER_LABEL[filter]}
                  <span class="text-[0.6875rem] text-chat-text-3 font-chat-mono ml-1">{count(filter)}</span>
                </SegmentGroup.ItemText>
                <SegmentGroup.ItemControl />
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
      </div>
      <ScrollArea.Root class="flex-1 min-h-0">
        <ScrollArea.Viewport class="overscroll-contain h-full">
          <ScrollArea.Content>
            <div class={LIST_PANEL_GROUP_LABEL}>By impact</div>
            <Show
              when={props.ran}
              fallback={
                <div class={`${LIST_PANEL_MESSAGE} flex flex-col gap-2 items-start`}>
                  <span>No diff has run for this width yet.</span>
                  {props.runAction}
                </div>
              }
            >
              <Show
                when={props.visible.length > 0}
                fallback={
                  <p class={`${LIST_PANEL_MESSAGE} m-0`}>
                    {props.rows.length === 0
                      ? 'The last run found nothing to report; the page matches its target.'
                      : 'No component matches this filter.'}
                  </p>
                }
              >
                <ul role="list" class="m-0 px-1 pb-2 list-none flex flex-col">
                  <For each={props.visible}>
                    {(row) => <RailRow row={row} selected={props.selected === row.key} onSelect={props.onSelect} />}
                  </For>
                </ul>
              </Show>
            </Show>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical">
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </nav>
  )
}
