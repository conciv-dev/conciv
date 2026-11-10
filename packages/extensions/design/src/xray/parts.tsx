import {createMemo, createSignal, For, Match, onMount, Show, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createVirtualizer} from '@tanstack/solid-virtual'
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  createTable,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
} from '@tanstack/solid-table'
import ArrowDown from 'lucide-solid/icons/arrow-down'
import ArrowUp from 'lucide-solid/icons/arrow-up'
import SearchIcon from 'lucide-solid/icons/search'
import {countBy} from 'es-toolkit'
import {Button, TextField, Tooltip} from '@conciv/ui-kit-system'
import {Chip} from '@conciv/ui-kit-chat/tools'
import type {createXrayData} from './data.js'
import {PartDetail} from './parts-detail.js'

export function Parts(props: {data: Data}): JSX.Element {
  const [filters, setFilters] = createStore<Filters>({
    search: '',
    tiers: {kit: true, app: false, other: false},
    onPage: true,
    preferred: false,
    hidden: false,
  })
  const listed = () => props.data.parts.latest
  const counts = createMemo(() => countBy(listed()?.components ?? [], (part) => part.tier))
  const rows = createMemo(() => {
    const shown = listed()
    if (!shown) return []
    const tiers = TIERS.filter((tier) => filters.tiers[tier])
    return (filters.hidden ? shown.hidden : shown.components).filter(
      (part) =>
        (tiers.length === 0 || tiers.includes(part.tier)) &&
        (!filters.onPage || part.onPage > 0) &&
        (!filters.preferred || part.flag === PREFER),
    )
  })
  const table = createTable({
    features: FEATURES,
    columns: COLUMNS,
    get data() {
      return rows()
    },
    state: {
      get globalFilter() {
        return filters.search
      },
    },
    onGlobalFilterChange: (next) => setFilters('search', typeof next === 'function' ? next(filters.search) : next),
    globalFilterFn: 'includesString',
    getColumnCanGlobalFilter: (column) => column.id === PART_COLUMN,
    initialState: {sorting: [{id: IMPORTS_COLUMN, desc: true}]},
    enableSortingRemoval: false,
    getRowId: (part) => part.id,
  })
  const tableRows = () => table.getRowModel().rows
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement>()
  const sizing = createMemo(() => rowSizing(connected(scrollElement())))
  const virtualizer = createVirtualizer({
    get count() {
      return tableRows().length
    },
    getScrollElement: () => connected(scrollElement()),
    estimateSize: () => sizing().row,
    getItemKey: (index) => tableRows()[index]?.id ?? index,
    get overscan() {
      return sizing().overscan
    },
  })
  const chips = (): FilterChip[] => [
    ...TIERS.map((tier) => ({
      label: `${TIER_NAMES[tier]} ${counts()[tier] ?? 0}`,
      on: filters.tiers[tier],
      toggle: () => setFilters('tiers', tier, (on) => !on),
    })),
    ...FLAGS.map((flag) => ({
      label: flag.label,
      on: filters[flag.key],
      toggle: () => setFilters(flag.key, (on) => !on),
    })),
  ]
  const clear = () =>
    setFilters({
      search: '',
      tiers: {kit: false, app: false, other: false},
      onPage: false,
      preferred: false,
      hidden: false,
    })
  const toggle = (id: string) => props.data.pickPart(props.data.part()?.id === id ? null : id)
  return (
    <div class="flex grow flex-col min-h-0" data-conciv-key="V9OglA">
      <div class="px-6 flex shrink-0 flex-col gap-3" data-conciv-key="Oi_SCg">
        <div class="relative" data-conciv-key="ahI5hw">
          <SearchIcon
            class="text-chat-text-3 size-3.5 pointer-events-none start-2.5 top-1/2 absolute -translate-y-1/2"
            aria-hidden="true"
          />
          <TextField
            aria-label="Search parts"
            placeholder="Search parts"
            type="search"
            variant="outline"
            class="[&_input]:ps-8"
            value={filters.search}
            onInput={(event) => setFilters('search', event.currentTarget.value)}
          />
        </div>
        <div role="group" aria-label="Filters" class="flex flex-wrap gap-1 items-center" data-conciv-key="-1o5Ww">
          <For each={chips()}>
            {(chip, index) => (
              <>
                <Show when={index() === TIERS.length}>
                  <span class="bg-chat-line h-3.5 w-px" aria-hidden="true" data-conciv-key="537SKw" />
                </Show>
                <Button
                  variant="plain"
                  size="none"
                  aria-pressed={chip.on}
                  class="rounded-chat-chip focus-ring"
                  onClick={() => chip.toggle()}
                >
                  <Chip kind="pill" size="compact" tone={chip.on ? 'accent' : 'neutral'} value={chip.label} />
                </Button>
              </>
            )}
          </For>
        </div>
      </div>
      <p role="status" class="sr-only" data-conciv-key="NiGvyg">
        {shownText(tableRows().length)}
      </p>
      <div
        ref={(element) => onMount(() => setScrollElement(element))}
        class="mt-4 grow min-h-0 [scrollbar-width:thin] overflow-y-auto"
        data-conciv-key="5MNCng"
      >
        <Switch>
          <Match when={props.data.parts.error !== undefined && !listed()}>
            <div class="px-6 pb-4 flex flex-col gap-2 items-start" data-conciv-key="zdDRmg">
              <p class="text-[length:var(--chat-text-md)] text-chat-text-2 m-0" data-conciv-key="yrgipQ">
                The catalog could not be read.
              </p>
              <Button variant="outline" size="sm" onClick={() => void props.data.refetchParts()}>
                Try again
              </Button>
            </div>
          </Match>
          <Match when={!listed()}>
            <p class="text-[length:var(--chat-text-md)] text-chat-text-2 m-0 px-6 pb-4" data-conciv-key="8BmIoA">
              Reading the catalog…
            </p>
          </Match>
          <Match when={listed()}>
            <table aria-label="Parts" class="grid w-full border-collapse" data-conciv-key="fJEp5g">
              <thead class="bg-chat-glass grid top-0 sticky z-1" data-conciv-key="Ksdhug">
                <For each={table.getHeaderGroups()}>
                  {(group) => (
                    <tr class="border-b border-chat-line-soft flex gap-2 items-center" data-conciv-key="wHwSeQ">
                      <For each={group.headers}>
                        {(header) => (
                          <th
                            scope="col"
                            aria-sort={ariaSort(header.column.getIsSorted())}
                            class={`font-normal py-1.5 ${CELL[header.column.id] ?? ''}`}
                            data-conciv-key="t8A0mw"
                          >
                            <Show when={header.column.getCanSort()}>
                              <Button
                                variant="plain"
                                size="bare"
                                class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold gap-1 whitespace-nowrap"
                                onClick={(event) => header.column.getToggleSortingHandler()?.(event)}
                              >
                                {`${header.column.columnDef.header ?? ''}`}
                                <Switch>
                                  <Match when={header.column.getIsSorted() === 'desc'}>
                                    <ArrowDown class="size-2.5" aria-hidden="true" />
                                  </Match>
                                  <Match when={header.column.getIsSorted() === 'asc'}>
                                    <ArrowUp class="size-2.5" aria-hidden="true" />
                                  </Match>
                                </Switch>
                              </Button>
                            </Show>
                          </th>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </thead>
              <Show
                when={tableRows().length > 0}
                fallback={
                  <tbody class="grid" data-conciv-key="D14tPg">
                    <tr class="px-6 py-4 flex flex-col gap-2 items-start" data-conciv-key="zDHHIQ">
                      <td class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="oAjKYg">
                        No parts match.
                      </td>
                      <td data-conciv-key="taTlqQ">
                        <Button variant="outline" size="sm" onClick={clear}>
                          Clear filters
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                }
              >
                <tbody
                  class="grid relative"
                  style={{height: `${virtualizer.getTotalSize()}px`}}
                  data-conciv-key="4smCjw"
                >
                  <For each={virtualizer.getVirtualItems()}>
                    {(item) => (
                      <Show when={tableRows()[item.index]}>
                        {(row) => (
                          <PartRow
                            part={row().original}
                            index={item.index}
                            start={item.start}
                            open={props.data.part()?.id === row().original.id}
                            measure={(element) => virtualizer.measureElement(element)}
                            toggle={() => toggle(row().original.id)}
                            data={props.data}
                          />
                        )}
                      </Show>
                    )}
                  </For>
                </tbody>
              </Show>
            </table>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

type Data = ReturnType<typeof createXrayData>

type Part = NonNullable<ReturnType<Data['parts']>>['components'][number]

type Tier = Part['tier']

type Filters = {
  search: string
  tiers: Record<Tier, boolean>
  onPage: boolean
  preferred: boolean
  hidden: boolean
}

type FilterChip = {label: string; on: boolean; toggle: () => void}

const TIERS: Tier[] = ['kit', 'app', 'other']

const TIER_NAMES: Record<Tier, string> = {kit: 'Kit', app: 'App', other: 'Other'}

const FLAGS = [
  {key: 'onPage', label: 'On this page'},
  {key: 'preferred', label: 'Preferred'},
  {key: 'hidden', label: 'Hidden'},
] as const

const PREFER = 'prefer'

const PREVIEW_COLUMN = 'preview'

const PART_COLUMN = 'part'

const IMPORTS_COLUMN = 'imports'

const ON_PAGE_COLUMN = 'onPage'

const ROW_SPACES = 14

const PREVIEW_BOX = 'border border-chat-line-soft rounded-chat-surface-sm bg-chat-fill-soft h-10 w-full'

const CELL: Record<string, string> = {
  [PREVIEW_COLUMN]: 'w-24 ps-6 shrink-0',
  [PART_COLUMN]: 'grow basis-0 min-w-0 text-start',
  [IMPORTS_COLUMN]: 'w-16 shrink-0 text-end',
  [ON_PAGE_COLUMN]: 'w-18 pe-6 shrink-0 text-end',
}

const FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {alphanumeric: sortFn_alphanumeric, basic: sortFn_basic},
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {includesString: filterFn_includesString},
})

const HELPER = createColumnHelper<typeof FEATURES, Part>()

const COLUMNS = HELPER.columns([
  HELPER.display({id: PREVIEW_COLUMN, header: ''}),
  HELPER.accessor('name', {id: PART_COLUMN, header: 'PART', sortFn: 'alphanumeric'}),
  HELPER.accessor('imports', {id: IMPORTS_COLUMN, header: 'IMPORTS', sortFn: 'basic', sortDescFirst: true}),
  HELPER.accessor('onPage', {id: ON_PAGE_COLUMN, header: 'ON PAGE', sortFn: 'basic', sortDescFirst: true}),
])

const PLURAL = new Intl.PluralRules('en')

function rowSizing(element: HTMLDivElement | null): {row: number; overscan: number} {
  if (!element) return {row: 0, overscan: 0}
  const space = Number.parseFloat(getComputedStyle(element).getPropertyValue('--chat-space'))
  const rem = Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize)
  const row = space * rem * ROW_SPACES
  return {row, overscan: Math.ceil(element.clientHeight / row)}
}

function connected(element: HTMLDivElement | undefined): HTMLDivElement | null {
  return element?.isConnected ? element : null
}

function shownText(count: number): string {
  return `${count} ${PLURAL.select(count) === 'one' ? 'part' : 'parts'} shown`
}

function ariaSort(sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending'
  return sorted === 'desc' ? 'descending' : 'none'
}

function PartRow(props: {
  part: Part
  index: number
  start: number
  open: boolean
  measure: (element: HTMLTableRowElement) => void
  toggle: () => void
  data: Data
}): JSX.Element {
  return (
    <tr
      data-index={props.index}
      ref={(element) => onMount(() => props.measure(element))}
      class="border-b border-chat-line-soft flex flex-wrap gap-x-2 w-full items-center start-0 top-0 absolute"
      style={{transform: `translateY(${props.start}px)`}}
      data-conciv-key="lSentA"
    >
      <td
        class={`${CELL[PREVIEW_COLUMN]} flex h-13.75 cursor-pointer items-center`}
        onClick={() => props.toggle()}
        data-conciv-key="TKHG3g"
      >
        <Show
          when={props.part.preview}
          fallback={
            <Tooltip.Root disabled={!props.part.previewError}>
              <Tooltip.Trigger
                asChild={(triggerProps) => (
                  <span {...triggerProps()} class={`${PREVIEW_BOX} block`} data-conciv-key="emdBLQ" />
                )}
              />
              <Tooltip.Positioner>
                <Tooltip.Content>{props.part.previewError}</Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>
          }
        >
          {(path) => (
            <iframe
              src={path()}
              title={`${props.part.name} preview`}
              sandbox="allow-scripts"
              tabindex="-1"
              aria-hidden="true"
              loading="lazy"
              class={`${PREVIEW_BOX} pointer-events-none`}
              data-conciv-key="iCjvMw"
            />
          )}
        </Show>
      </td>
      <td
        class={`${CELL[PART_COLUMN]} flex gap-2 cursor-pointer items-center`}
        onClick={() => props.toggle()}
        data-conciv-key="GCvJCA"
      >
        <Button
          variant="plain"
          size="bare"
          aria-expanded={props.open}
          class="text-sm text-chat-text-hi min-w-0 justify-start"
        >
          <span class="truncate" data-conciv-key="9yRHOQ">
            {props.part.name}
          </span>
        </Button>
        <Chip kind="pill" size="compact" tone="neutral" value={props.part.tier} class="shrink-0" />
        <Show when={props.part.flag === PREFER}>
          <Chip kind="pill" size="compact" tone="accent" value={PREFER} class="shrink-0" />
        </Show>
      </td>
      <td
        class={`${CELL[IMPORTS_COLUMN]} text-sm text-chat-text cursor-pointer tabular-nums`}
        onClick={() => props.toggle()}
        data-conciv-key="s0Lk0A"
      >
        {props.part.imports}
      </td>
      <td
        class={`${CELL[ON_PAGE_COLUMN]} text-sm text-chat-text cursor-pointer tabular-nums`}
        onClick={() => props.toggle()}
        data-conciv-key="mCph3g"
      >
        {props.part.onPage}
      </td>
      <Show when={props.open}>
        <td class="bg-chat-fill-soft w-full" data-conciv-key="UqRYhw">
          <PartDetail part={props.part} data={props.data} />
        </td>
      </Show>
    </tr>
  )
}
