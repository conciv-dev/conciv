import {createEffect, For, on, Show, type JSX} from 'solid-js'
import {upperFirst} from 'es-toolkit'
import {Button, ClipboardCopyButton, Collapsible, ScrollArea, SegmentGroup, TextField} from '@conciv/ui-kit-system'
import type {DeltaKindName} from '../shared/defs.js'
import type {SourceLoc} from '../shared/types.js'
import {rowAboveTolerance, type Delta, type Row} from './data.js'
import {fixPrompt, traced} from './fix-prompt.js'

const FILTERS = ['all', 'above'] as const
export type Filter = (typeof FILTERS)[number]

export const SMALL_BUTTON = 'font-chat focus-ring text-[0.75rem] rounded-chat-surface-sm h-7 px-2.5'

const FILTER_LABEL: Record<Filter, string> = {all: 'All', above: 'Off'}

const PAGE_PERCENT = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const ROW_PERCENT = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const SHARE = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1})
const AMOUNT = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})

type Measure = 'px' | 'share' | 'plain'

const KIND: Record<DeltaKindName, {name: string; measure: Measure}> = {
  'inset-left': {name: 'left edge', measure: 'px'},
  'inset-right': {name: 'right edge', measure: 'px'},
  'inset-top': {name: 'top edge', measure: 'px'},
  'inset-bottom': {name: 'bottom edge', measure: 'px'},
  'gap-before': {name: 'gap before', measure: 'px'},
  'gap-after': {name: 'gap after', measure: 'px'},
  fill: {name: 'width share', measure: 'share'},
  align: {name: 'alignment', measure: 'plain'},
  padding: {name: 'padding', measure: 'px'},
  fontSize: {name: 'font size', measure: 'px'},
  lineHeight: {name: 'line height', measure: 'px'},
  fontWeight: {name: 'font weight', measure: 'plain'},
  background: {name: 'background', measure: 'plain'},
  foreground: {name: 'text color', measure: 'plain'},
  radius: {name: 'corner radius', measure: 'px'},
}

const PADDING_AXIS: Record<string, string> = {x: 'horizontal padding', y: 'vertical padding'}

export function percent(value: number): string {
  return PAGE_PERCENT.format(value)
}

function kindName(delta: Delta): string {
  if (delta.kind === 'padding' && delta.side !== undefined) return PADDING_AXIS[delta.side] ?? KIND.padding.name
  return KIND[delta.kind].name
}

function amount(input: {delta: Delta; value: number | string}): string {
  if (typeof input.value === 'string') return input.value
  const measure = KIND[input.delta.kind].measure
  if (measure === 'share') return SHARE.format(input.value)
  if (measure === 'px') return `${AMOUNT.format(input.value)}px`
  return AMOUNT.format(input.value)
}

function rowSummary(row: Row): string {
  if (row.unmatched === 'extra') return 'extra, not in the design'
  if (row.unmatched === 'missing') return 'missing, in the design only'
  if (row.deltas.length === 0) return 'matches'
  return row.deltas
    .map(
      (delta) =>
        `${kindName(delta)} ${amount({delta, value: delta.live})}, design ${amount({delta, value: delta.target})}`,
    )
    .join(', ')
}

function deltaSentence(delta: Delta): string {
  return `${upperFirst(kindName(delta))} is ${amount({delta, value: delta.live})}, the design has ${amount({delta, value: delta.target})}.`
}

function where(delta: Delta): string {
  if (delta.line === undefined) return `${delta.file}`
  return `${delta.file}:${delta.line}`
}

function asSentence(text: string): string {
  return text.endsWith('.') ? upperFirst(text) : `${upperFirst(text)}.`
}

function unmatchedNote(row: Row): string {
  if (row.unmatched === 'extra')
    return 'The target has nothing under this box; the live tree renders an element the design does not have.'
  return 'The target has an element here that the live page does not render.'
}

export function filterRows(input: {rows: Row[]; filter: Filter; query: string}): Row[] {
  const needle = input.query.trim().toLowerCase()
  return input.rows
    .filter((row) => input.filter !== 'above' || rowAboveTolerance(row))
    .filter((row) => needle === '' || `${row.label} ${row.selector}`.toLowerCase().includes(needle))
}

function DeltaLine(props: {delta: Delta; onOpen: (source: SourceLoc) => void}): JSX.Element {
  return (
    <p class="m-0 text-pretty">
      <span class="text-chat-text">{deltaSentence(props.delta)}</span>
      <Show when={traced(props.delta) && props.delta.file}>
        {(file) => (
          <>
            {' '}
            Set via {props.delta.via} in{' '}
            <Button
              variant="link"
              size="none"
              class="font-chat-mono break-all focus-ring"
              onClick={() => props.onOpen({file: file(), line: props.delta.line ?? 1, column: props.delta.column ?? 1})}
            >
              {where(props.delta)}
            </Button>
            <Show when={props.delta.declaration} fallback=".">
              {(declaration) => (
                <>
                  , declared <code class="font-chat-mono">{declaration()}</code>.
                </>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={props.delta.suggest}>{(suggest) => <> {asSentence(suggest())}</>}</Show>
    </p>
  )
}

function Detail(props: {row: Row; opening: boolean; onOpen: (source: SourceLoc) => void}): JSX.Element {
  const prompt = () => fixPrompt(props.row)
  return (
    <div class="text-[0.8125rem] text-chat-text-2 leading-normal px-3 pb-3 pt-1 flex flex-col gap-2">
      <Show when={props.row.tag !== ''}>
        <p class="font-chat-mono m-0 break-all">
          &lt;{props.row.tag}&gt; {props.row.selector}
        </p>
      </Show>
      <Show when={props.row.unmatched !== null}>
        <p class="m-0 text-pretty">{unmatchedNote(props.row)}</p>
      </Show>
      <For each={props.row.deltas}>{(delta) => <DeltaLine delta={delta} onOpen={props.onOpen} />}</For>
      <Show when={props.row.source !== null || prompt() !== null}>
        <div class="pt-1 flex flex-wrap gap-3 items-center">
          <Show when={props.row.source}>
            {(source) => (
              <Button
                variant="outline"
                size="none"
                class={SMALL_BUTTON}
                disabled={props.opening}
                onClick={() => props.onOpen(source())}
              >
                Open source
              </Button>
            )}
          </Show>
          <Show when={prompt()}>
            {(text) => (
              <span class="text-[0.75rem] text-chat-text-2 flex gap-1 items-center">
                <ClipboardCopyButton
                  text={text()}
                  tooltips={{idle: 'Copy fix prompt', copied: 'Fix prompt copied'}}
                  variant="ghost"
                />
                <span aria-hidden="true">Copy fix prompt</span>
              </span>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

type RowProps = {
  row: Row
  selected: boolean
  opening: boolean
  onSelect: (row: Row) => void
  onHover: (key: string | null) => void
  onOpen: (source: SourceLoc) => void
}

const TRIGGER =
  'w-full grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2 px-3 text-left cursor-pointer rounded-chat-surface-sm trans-bg hover:bg-chat-fill focus-ring'

function ComponentRow(props: RowProps): JSX.Element {
  const held: {item?: HTMLLIElement} = {}
  const off = () => rowAboveTolerance(props.row)
  createEffect(
    on(
      () => props.selected,
      (selected) => {
        if (selected) held.item?.scrollIntoView({block: 'nearest'})
      },
    ),
  )
  return (
    <li
      ref={(item) => {
        held.item = item
      }}
      onPointerEnter={() => props.onHover(props.row.key)}
      onPointerLeave={() => props.onHover(null)}
    >
      <section
        aria-label={props.selected ? 'component' : undefined}
        class={`rounded-chat-surface-sm ${props.selected ? 'bg-chat-fill' : ''}`}
      >
        <Collapsible.Root
          open={props.selected}
          onOpenChange={(details) => {
            if (details.open) props.onSelect(props.row)
          }}
        >
          <Collapsible.Trigger class={TRIGGER}>
            <span
              class={`text-[0.8125rem] font-chat-mono truncate ${props.selected ? 'text-chat-text-hi' : 'text-chat-text'}`}
            >
              {props.row.label}
            </span>
            <span class={`text-[0.8125rem] tabular-nums ${off() ? 'text-chat-danger' : 'text-chat-text-2'}`}>
              {props.row.mismatch === null ? '' : ROW_PERCENT.format(props.row.mismatch)}
            </span>
            <span class="text-[0.75rem] text-chat-text-3 col-span-2 truncate">{rowSummary(props.row)}</span>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <Show when={props.selected}>
              <Detail row={props.row} opening={props.opening} onOpen={props.onOpen} />
            </Show>
          </Collapsible.Content>
        </Collapsible.Root>
      </section>
    </li>
  )
}

type ListProps = {
  rows: Row[]
  visible: Row[]
  selected: string | null
  filter: Filter
  query: string
  ran: boolean
  opening: boolean
  runAction: JSX.Element
  onFilter: (filter: Filter) => void
  onQuery: (query: string) => void
  onSelect: (row: Row) => void
  onHover: (key: string | null) => void
  onOpen: (source: SourceLoc) => void
}

const MESSAGE = 'm-0 px-3 py-4 text-[0.8125rem] text-chat-text-2 text-pretty'

export function ComponentList(props: ListProps): JSX.Element {
  const count = (filter: Filter) => filterRows({rows: props.rows, filter, query: ''}).length
  return (
    <aside aria-label="Components" class="border-l border-chat-line bg-chat-panel flex flex-col min-h-0 min-w-0">
      <div class="p-3 border-b border-chat-line flex flex-col gap-2">
        <TextField
          aria-label="Filter components"
          placeholder="Filter components"
          name="q"
          autocomplete="off"
          spellcheck={false}
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <SegmentGroup.Root
          aria-label="Show"
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
                  {FILTER_LABEL[filter]} <span class="text-chat-text-3 tabular-nums">{count(filter)}</span>
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
            <Show
              when={props.ran}
              fallback={
                <div class={`${MESSAGE} flex flex-col gap-3 items-start`}>
                  <span>No diff has run for this width yet.</span>
                  {props.runAction}
                </div>
              }
            >
              <Show
                when={props.rows.length > 0}
                fallback={<p class={MESSAGE}>Nothing to report, the page matches its design.</p>}
              >
                <Show when={props.visible.length > 0} fallback={<p class={MESSAGE}>No component matches.</p>}>
                  <ul role="list" class="m-0 p-1.5 list-none flex flex-col gap-0.5">
                    <For each={props.visible}>
                      {(row) => (
                        <ComponentRow
                          row={row}
                          selected={props.selected === row.key}
                          opening={props.opening}
                          onSelect={props.onSelect}
                          onHover={props.onHover}
                          onOpen={props.onOpen}
                        />
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </Show>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical">
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  )
}
