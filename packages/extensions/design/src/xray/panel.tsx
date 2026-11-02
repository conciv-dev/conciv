import {For, onMount, Show, type JSX, createSignal} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {compact, minBy, uniq} from 'es-toolkit'
import {RelativeTime, SegmentGroup, TooltipIconButton} from '@conciv/ui-kit-system'
import {STAGES, type ComponentReport, type DeltaKindName, type DiffReport, type Stage} from '../shared/defs.js'
import {
  aboveTolerance,
  componentAboveTolerance,
  deltaSentence,
  kindStage,
  kindTolerance,
  SOURCE_ATTR,
  traced,
} from '../shared/tolerances.js'
import type {
  Box,
  Decision,
  MeasureSource,
  PairRecord,
  SourceLoc,
  TargetNode,
  TargetRecord,
  TwinPair,
} from '../shared/types.js'

export type Delta = ComponentReport['deltas'][number]

export type Row = {
  key: string
  label: string
  source: SourceLoc | null
  tag: string
  selector: string
  live: Box | null
  target: Box | null
  mismatch: number | null
  deltas: Delta[]
  unmatched: 'unbuilt' | 'extra' | 'offset' | null
  query: string | null
  stage: Stage | null
  measured: MeasureSource | null
  confidence: number | null
  width: number | null
  warning: boolean
  nodes: string[]
  opinion: {live: number | string; confidence: number} | null
  twinDisagreement: ComponentReport['twinDisagreement'] | null
}

type WidthTab = {target: TargetRecord; off: number | null}

export type XrayImages = {target: string; live: string | null; diff: string | null}

export type XrayData = {
  target: TargetRecord
  report: DiffReport | null
  nodes: TargetNode[]
  images: XrayImages
  widths: WidthTab[]
  columns: ReportResponse[]
  ranAt: number | null
  sourceChangedAt: number | null
  decisions: Decision[]
  pairs: PairRecord[]
  twins: Record<string, TwinPair[]>
}

export type ReportResponse = {
  target: TargetRecord
  report: DiffReport | null
  targetImage: string
  nodes: TargetNode[]
  sourceChangedAt: number | null
  decisions: Decision[]
  pairs: PairRecord[]
  twins: Record<string, TwinPair[]>
}

export function sourceLabel(source: SourceLoc | null): string {
  if (source === null) return 'no source'
  return `${source.file}:${source.line}`
}

export function reportRows(report: DiffReport | null): Row[] {
  if (report === null) return []
  return [
    ...report.components.map((component, index) => componentRow({component, index, report})),
    ...report.unmatched.map((region, index) => regionRow({region, index, report})),
  ]
}

type Region = DiffReport['unmatched'][number]

function componentRow(input: {component: ComponentReport; index: number; report: DiffReport}): Row {
  const {component, report} = input
  return {
    key: `${component.selector}#${input.index}`,
    label: sourceLabel(component.source),
    source: component.source,
    tag: component.tag,
    selector: component.selector.startsWith(`[${SOURCE_ATTR}=`) ? component.tag : component.selector,
    live: component.live,
    target: component.target,
    mismatch: component.mismatch,
    deltas: component.deltas,
    unmatched: null,
    query: component.selector,
    ...deltaMeta({deltas: component.deltas, report}),
    warning: report.warnings.some((warning) => sameSite({warning, source: component.source})),
    nodes: component.nodes ?? [],
    ...secondOpinions(component),
  }
}

function secondOpinions(component: ComponentReport): Pick<Row, 'opinion' | 'twinDisagreement'> {
  return {
    opinion: component.deltas.find((delta) => delta.opinion !== undefined)?.opinion ?? null,
    twinDisagreement: component.twinDisagreement ?? null,
  }
}

function deltaMeta(input: {
  deltas: Delta[]
  report: DiffReport
}): Pick<Row, 'stage' | 'measured' | 'confidence' | 'width'> {
  const [first] = input.deltas
  const stages = compact(input.deltas.map((delta) => kindStage(delta.kind)))
  return {
    stage: minBy(stages, (stage) => STAGES.indexOf(stage)) ?? null,
    measured: first?.source ?? input.report.sources[0] ?? null,
    confidence: first?.confidence ?? null,
    width: first?.width ?? input.report.target.width,
  }
}

function regionRow(input: {region: Region; index: number; report: DiffReport}): Row {
  const {region, report} = input
  return {
    key: `unmatched-${input.index}`,
    label: region.source === undefined ? `${region.kind} region` : sourceLabel(region.source),
    source: region.source ?? null,
    tag: '',
    selector: '',
    live: region.live ?? null,
    target: region.target ?? null,
    mismatch: null,
    deltas: [],
    unmatched: region.kind,
    query: regionQuery(region),
    stage: region.stage ?? null,
    measured: report.sources[0] ?? null,
    confidence: null,
    width: report.target.width,
    warning: false,
    nodes: region.node === undefined ? [] : [region.node],
    opinion: null,
    twinDisagreement: null,
  }
}

function regionQuery(region: Region): string | null {
  if (region.source === undefined || region.live === undefined) return null
  return `[${SOURCE_ATTR}="${region.source.file}:${region.source.line}:${region.source.column}"]`
}

function sameSite(input: {warning: Delta; source: SourceLoc | null}): boolean {
  return input.source !== null && input.warning.file === input.source.file && input.warning.line === input.source.line
}

export function rowAboveTolerance(row: Row): boolean {
  if (row.unmatched !== null || row.mismatch === null) return true
  return componentAboveTolerance({deltas: row.deltas, mismatch: row.mismatch})
}

function runTime(report: DiffReport | null): number | null {
  const name = report?.livePath.split('/').at(-1)
  if (name === undefined) return null
  const at = Number(name.split('-')[1])
  return Number.isFinite(at) ? at : null
}

export function assemble(input: {
  current: ReportResponse
  siblings: ReportResponse[]
  image: (path: string) => string
}) {
  const {current, siblings, image} = input
  const data: XrayData = {
    target: current.target,
    report: current.report,
    nodes: current.nodes,
    images: {
      target: image(current.targetImage),
      live: current.report === null ? null : image(current.report.livePath),
      diff: current.report === null ? null : image(current.report.diffImage),
    },
    widths: siblings
      .map((sibling) => ({
        target: sibling.target,
        off: sibling.report === null ? null : aboveTolerance(sibling.report),
      }))
      .toSorted((a, b) => a.target.width - b.target.width),
    columns: siblings
      .filter((sibling) => sibling.target.session === current.target.session)
      .toSorted((a, b) => a.target.width - b.target.width),
    ranAt: runTime(current.report),
    sourceChangedAt: current.sourceChangedAt,
    decisions: current.decisions,
    pairs: current.pairs,
    twins: current.twins,
  }
  return data
}

export function stale(data: XrayData): boolean {
  return data.sourceChangedAt !== null && data.ranAt !== null && data.sourceChangedAt > data.ranAt
}

export const FILTERS = ['all', 'above', 'match', 'none'] as const
export type Filter = (typeof FILTERS)[number]

type FilterChoice = {above: boolean; match: boolean}

function filterChoice(filter: Filter): FilterChoice {
  return {above: filter === 'all' || filter === 'above', match: filter === 'all' || filter === 'match'}
}

function shown(input: {row: Row; filter: Filter}): boolean {
  const choice = filterChoice(input.filter)
  return rowAboveTolerance(input.row) ? choice.above : choice.match
}

export function filterRows(input: {rows: Row[]; filter: Filter; query: string}): Row[] {
  const needle = input.query.trim().toLowerCase()
  return input.rows
    .filter((row) => shown({row, filter: input.filter}))
    .filter((row) => needle === '' || `${row.label} ${row.selector} ${row.tag}`.toLowerCase().includes(needle))
}

const AMOUNT = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})

type BadgeColor = 'orange' | 'red' | 'amber'

const BADGE_COLOR: Partial<Record<DeltaKindName, BadgeColor>> = {
  background: 'red',
  foreground: 'red',
  fontSize: 'amber',
  lineHeight: 'amber',
  fontWeight: 'amber',
}

function baseName(file: string): string {
  const name = file.split('/').at(-1) ?? file
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function rowTitle(row: Row): string {
  return row.source === null ? rowName(row) : baseName(row.source.file)
}

export function rowName(row: Row): string {
  if (row.source !== null) return `${baseName(row.source.file)} ${row.tag}`.trim()
  if (row.selector !== '') return row.selector
  return row.label
}

function deltaValue(input: {delta: Delta; value: number | string}): string {
  if (typeof input.value === 'string') return input.value
  return AMOUNT.format(input.value)
}

function badgeText(delta: Delta): string {
  return `${delta.kind} ${deltaValue({delta, value: delta.live})} → ${deltaValue({delta, value: delta.target})}`
}

function badgeColor(delta: Delta): BadgeColor {
  return BADGE_COLOR[delta.kind] ?? 'orange'
}

export type View = 'list' | 'capture'

export function fixPrompt(row: Row): string | null {
  const deltas = row.deltas.filter(traced)
  if (deltas.length === 0) return null
  return `Fix ${row.label} (${row.selector}) to match the design: ${deltas.map(deltaSentence).join('. ')}.`
}

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
  marks?: (row: Row) => JSX.Element
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
          {props.marks?.(props.row)}
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

export type RowGroup = {name: string | null; rows: Row[]}

type ComponentRowsProps = {
  groups: RowGroup[]
  selected: string | null
  fixed: Set<string>
  onSelect: (key: string) => void
  marks?: (row: Row) => JSX.Element
  children: (row: Row) => JSX.Element
}

export function ComponentRows(props: ComponentRowsProps): JSX.Element {
  const rows = () => props.groups.flatMap((group) => group.rows)
  return (
    <ul role="list" aria-label="Components" class="m-0 p-0 pb-16 pt-4 list-none flex flex-col gap-2">
      <For each={props.groups}>
        {(group) => (
          <>
            <Show when={group.name}>
              {(name) => (
                <li role="presentation" class="pt-2 first:pt-0">
                  <h3 class="text-xs color-meta font-medium m-0">{name()}</h3>
                </li>
              )}
            </Show>
            <For each={group.rows}>
              {(row) => (
                <ComponentRow
                  row={row}
                  index={rows().indexOf(row)}
                  expanded={props.selected === row.key}
                  fixed={props.fixed.has(row.key)}
                  onSelect={props.onSelect}
                  marks={props.marks}
                >
                  {props.children}
                </ComponentRow>
              )}
            </For>
          </>
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

const CONTEXT_PX = 24
const CROP_MAX_PX = 560
const COPIED_MS = 1200

const PX_KINDS: DeltaKindName[] = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'padding',
  'fontSize',
  'lineHeight',
  'radius',
]

const COLOR_KINDS: DeltaKindName[] = ['background', 'foreground']

const PLURAL = new Intl.PluralRules(undefined)

const UNMATCHED_NOTE = {
  extra: 'The live page renders an element the design does not have.',
  unbuilt: 'The design has an element here that the live page does not render.',
  offset: 'The element renders away from where the design places it.',
}

function count(input: {value: number; one: string; other: string}): string {
  return `${input.value} ${PLURAL.select(input.value) === 'one' ? input.one : input.other}`
}

function cellValue(input: {delta: Delta; value: number | string}): string {
  const text = deltaValue(input)
  if (typeof input.value === 'number' && PX_KINDS.includes(input.delta.kind) && input.value !== 0) return `${text}px`
  return text
}

function deltaSource(delta: Delta): SourceLoc | null {
  if (!traced(delta) || delta.file === undefined) return null
  return {file: delta.file, line: delta.line ?? 1, column: delta.column ?? 1}
}

function deltaWhere(delta: Delta): string {
  return delta.line === undefined ? `${delta.file}` : `${delta.file}:${delta.line}`
}

type Crop = {x: number; y: number; w: number; h: number}

function cropAround(input: {boxes: Box[]; target: TargetRecord}): Crop {
  const x = Math.max(Math.min(...input.boxes.map((box) => box.x)) - CONTEXT_PX, 0)
  const y = Math.max(Math.min(...input.boxes.map((box) => box.y)) - CONTEXT_PX, 0)
  const right = Math.max(...input.boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...input.boxes.map((box) => box.y + box.h))
  return {
    x,
    y,
    w: Math.min(right + CONTEXT_PX, input.target.width) - x,
    h: Math.min(bottom + CONTEXT_PX, input.target.height) - y,
  }
}

function placed(input: {box: Box; crop: Crop}): JSX.CSSProperties {
  return {
    left: `${((input.box.x - input.crop.x) / input.crop.w) * 100}%`,
    top: `${((input.box.y - input.crop.y) / input.crop.h) * 100}%`,
    width: `${(input.box.w / input.crop.w) * 100}%`,
    height: `${(input.box.h / input.crop.h) * 100}%`,
  }
}

function Swatch(props: {delta: Delta; value: number | string}): JSX.Element {
  return (
    <Show when={COLOR_KINDS.includes(props.delta.kind) && typeof props.value === 'string'}>
      <span
        class="me-1.5 align-[-1px] border border-base rounded-sm size-2.5 inline-block"
        style={{background: String(props.value)}}
        aria-hidden="true"
      />
    </Show>
  )
}

function SetBy(props: {delta: Delta; onOpen: (source: SourceLoc) => void}): JSX.Element {
  return (
    <Show
      when={deltaSource(props.delta)}
      fallback={
        <Show when={props.delta.via} fallback={<span class="color-meta">unknown</span>}>
          {(via) => <span class="color-meta">{via()}</span>}
        </Show>
      }
    >
      {(source) => (
        <span class="flex gap-2 items-center">
          <Show when={props.delta.declaration} fallback={<span>{props.delta.via}</span>}>
            {(declaration) => <code class="font-mono px-1 rounded bg-code">{declaration()}</code>}
          </Show>
          <button
            type="button"
            class="color-meta focus-base rounded transition hover:text-current hover:underline"
            onClick={() => props.onOpen(source())}
          >
            {deltaWhere(props.delta)}
          </button>
        </span>
      )}
    </Show>
  )
}

function noDeltaNote(row: Row): string {
  if (row.unmatched !== null) return UNMATCHED_NOTE[row.unmatched]
  if (rowAboveTolerance(row)) return 'The paint differs from the design, but no property delta was measured.'
  return 'Matches the design.'
}

function PropertyTable(props: {row: Row; opinions: boolean; onOpen: (source: SourceLoc) => void}): JSX.Element {
  return (
    <Show
      when={props.row.deltas.length > 0}
      fallback={<p class="text-sm m-0 op-fade flex-1">{noDeltaNote(props.row)}</p>}
    >
      <div class="flex-1 max-w-full min-w-0 overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Property</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Live</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Design</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base w-full">Set by</th>
            </tr>
          </thead>
          <tbody class="text-sm font-mono">
            <For each={props.row.deltas}>
              {(delta) => (
                <tr class="border-b border-base last:border-b-0">
                  <td class="p-2 whitespace-nowrap">{delta.kind}</td>
                  <td class="p-2 whitespace-nowrap">
                    <Swatch delta={delta} value={delta.live} />
                    {cellValue({delta, value: delta.live})}
                    <Show when={props.opinions && delta.opinion}>
                      {(opinion) => (
                        <span class="text-xs color-meta font-sans ms-2">
                          {opinionAgrees({delta, live: opinion().live})
                            ? 'takumi agrees'
                            : `takumi says ${cellValue({delta, value: opinion().live})}`}
                        </span>
                      )}
                    </Show>
                  </td>
                  <td class="color-active p-2 whitespace-nowrap">
                    <Swatch delta={delta} value={delta.target} />
                    {cellValue({delta, value: delta.target})}
                  </td>
                  <td class="p-2 whitespace-nowrap">
                    <SetBy delta={delta} onOpen={props.onOpen} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}

function opinionAgrees(input: {delta: Delta; live: number | string}): boolean {
  const {delta, live} = input
  if (typeof live !== 'number' || typeof delta.live !== 'number') return live === delta.live
  return Math.abs(live - delta.live) <= kindTolerance(delta.kind)
}

function CaptureCrop(props: {row: Row; live: string; target: TargetRecord}): JSX.Element {
  const boxes = () => compact([props.row.live, props.row.target])
  const crop = () => cropAround({boxes: boxes(), target: props.target})
  return (
    <Show when={boxes().length > 0}>
      <figure class="m-0 flex flex-col gap-1.5 min-w-0" style={{width: `${Math.min(crop().w, CROP_MAX_PX)}px`}}>
        <figcaption class="text-xs flex flex-wrap gap-3 items-center">
          <span class="color-meta">Live capture · {props.target.width}</span>
          <span class="op-75 flex gap-1 items-center">
            <span class="border border-neutral-400 border-dashed h-2 w-3" aria-hidden="true" />
            live box
          </span>
          <span class="op-75 flex gap-1 items-center">
            <span class="border border-primary-500 h-2 w-3" aria-hidden="true" />
            design box
          </span>
        </figcaption>
        <div
          class="border border-base rounded bg-secondary max-w-full relative overflow-hidden"
          style={{'aspect-ratio': `${crop().w} / ${crop().h}`}}
        >
          <img
            class="max-w-none absolute"
            src={props.live}
            alt={`Live capture around ${rowName(props.row)}`}
            draggable={false}
            style={{
              width: `${(props.target.width / crop().w) * 100}%`,
              left: `${(-crop().x / crop().w) * 100}%`,
              top: `${(-crop().y / crop().h) * 100}%`,
            }}
          />
          <Show when={props.row.live}>
            {(live) => (
              <span
                class="outline-1 outline-neutral-400 outline outline-dashed absolute"
                style={placed({box: live(), crop: crop()})}
                aria-hidden="true"
              />
            )}
          </Show>
          <Show when={props.row.target}>
            {(design) => (
              <span
                class="outline-1 outline-primary-500 outline absolute"
                style={placed({box: design(), crop: crop()})}
                aria-hidden="true"
              />
            )}
          </Show>
        </div>
      </figure>
    </Show>
  )
}

type ComponentDetailProps = {
  row: Row
  images: XrayImages
  target: TargetRecord
  opening: boolean
  opinions: boolean
  onOpen: (source: SourceLoc) => void
  onCopied: (copied: boolean) => void
}

export function ComponentDetail(props: ComponentDetailProps): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  createTimer(
    () => setCopied(false),
    () => copied() && COPIED_MS,
    setTimeout,
  )
  const prompt = () => fixPrompt(props.row)
  const lines = () => uniq(props.row.deltas.flatMap((delta) => (traced(delta) ? [deltaWhere(delta)] : []))).length
  const copy = (text: string) => {
    const report = props.onCopied
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        report(true)
      },
      () => report(false),
    )
  }
  return (
    <div class="xray-rise ms-14 border border-base rounded-lg bg-base overflow-hidden">
      <div class="p-4 flex flex-wrap gap-6 items-start">
        <PropertyTable row={props.row} opinions={props.opinions} onOpen={props.onOpen} />
        <Show when={props.images.live}>
          {(live) => <CaptureCrop row={props.row} live={live()} target={props.target} />}
        </Show>
      </div>
      <div class="px-4 py-3 border-t border-base flex flex-wrap gap-2 items-center justify-end">
        <span class="text-sm me-auto op-fade">
          {count({value: props.row.deltas.length, one: 'property', other: 'properties'})} ·{' '}
          {count({value: lines(), one: 'source line', other: 'source lines'})}
        </span>
        <button
          type="button"
          class="btn-action-sm"
          disabled={props.row.source === null || props.opening}
          title={props.row.source === null ? 'No source position' : undefined}
          onClick={() => {
            if (props.row.source !== null) props.onOpen(props.row.source)
          }}
        >
          <span class="i-ph-pencil-simple-duotone" aria-hidden="true" />
          Open source
        </button>
        <Show when={prompt()}>
          {(text) => (
            <button type="button" class="text-sm btn-primary px-2.5 py-1" onClick={() => copy(text())}>
              <span class={copied() ? 'i-ph-check' : 'i-ph-copy-duotone'} aria-hidden="true" />
              Copy fix prompt
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}

const MOBILE_WIDTH = 768

const SEGMENT_ROOT = 'gap-2! p-0! rounded-none! bg-transparent! border-0!'
const SEGMENT_LABEL = 'text-sm! font-sans! text-current! op-fade'
const SEGMENT_ITEM =
  'border border-base rounded! px-2! py-1! gap-2! font-sans! text-current! whitespace-nowrap shrink-0 op-50 grayscale transition hover:op-100 data-[state=checked]:op-100 data-[state=checked]:grayscale-0'
const SEGMENT_INDICATOR = 'bg-active! rounded!'

const VIEW_ITEMS: {view: View; label: string; icon: string}[] = [
  {view: 'list', label: 'List', icon: 'i-ph-list-bullets-duotone'},
  {view: 'capture', label: 'Capture', icon: 'i-ph-image-duotone'},
]

function parseView(value: string): View {
  return value === 'capture' ? 'capture' : 'list'
}

const CHIP_FOCUS = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40'

type RadioChipProps = {
  group: string
  checked: boolean
  icon: string
  small?: boolean
  disabled?: boolean
  onSelect: () => void
  children: JSX.Element
}

function chipState(state: {checked: boolean; disabled?: boolean}): string {
  if (state.disabled) return 'op-30! pointer-events-none'
  return state.checked ? 'bg-active op-100' : 'grayscale op-50 hover:op-100'
}

export function RadioChip(props: RadioChipProps): JSX.Element {
  return (
    <label
      class={`btn-action cursor-pointer whitespace-nowrap ${CHIP_FOCUS}  ${props.small ? 'text-sm' : ''}  ${chipState(props)}`}
    >
      <input
        type="radio"
        class="sr-only"
        name={props.group}
        checked={props.checked}
        disabled={props.disabled}
        onChange={() => props.onSelect()}
      />
      <span class={props.icon} aria-hidden="true" />
      {props.children}
    </label>
  )
}

type CheckChipProps = {
  checked: boolean
  icon: string
  label: string
  onToggle: (checked: boolean) => void
}

export function CheckChip(props: CheckChipProps): JSX.Element {
  return (
    <label
      class={`px-2 py-1 border border-base rounded-md flex gap-1 cursor-pointer select-none transition items-center ${CHIP_FOCUS}  ${props.checked ? 'bg-active' : 'grayscale op-50 hover:op-100'}`}
    >
      <input
        type="checkbox"
        class="me-1 accent-primary-500"
        checked={props.checked}
        onChange={(event) => props.onToggle(event.currentTarget.checked)}
      />
      <span class={props.icon} aria-hidden="true" />
      <span class="text-sm">{props.label}</span>
    </label>
  )
}

function widthIcon(width: number): string {
  return width < MOBILE_WIDTH ? 'i-ph-device-mobile-duotone' : 'i-ph-monitor-duotone'
}

function widthSummary(tab: WidthTab): string {
  return tab.off === null ? 'no run' : `${tab.off} off`
}

export function RunButton(props: {running: boolean; onRun: () => void; primary?: boolean}): JSX.Element {
  return (
    <button
      type="button"
      class={props.primary ? 'btn-primary text-sm' : 'btn-action-sm'}
      aria-busy={props.running}
      disabled={props.running}
      onClick={() => props.onRun()}
    >
      <span
        class={
          props.running ? 'i-ph-circle-notch animate-spin motion-reduce:animate-none' : 'i-ph-arrow-clockwise-duotone'
        }
        aria-hidden="true"
      />
      Run diff
    </button>
  )
}

type XrayPanelProps = {
  data: XrayData
  filter: Filter
  query: string
  view: View
  running: boolean
  onFilter: (filter: Filter) => void
  onQuery: (query: string) => void
  onView: (view: View) => void
  onTarget: (id: string) => void
  onRun: () => void
}

export function XrayPanel(props: XrayPanelProps): JSX.Element {
  const choice = () => filterChoice(props.filter)
  const targetIds = () => props.data.widths.map((tab) => tab.target.id)
  const tabById = (id: string) => props.data.widths.find((tab) => tab.target.id === id)
  return (
    <div class="border border-base rounded-xl bg-glass flex flex-col">
      <div class="flex flex-wrap min-w-0 items-center">
        <input
          class="px-4 py-2 outline-none bg-transparent flex-1 min-w-40 placeholder:text-current placeholder:op-50"
          placeholder="Search"
          aria-label="Search components"
          name="q"
          autocomplete="off"
          spellcheck={false}
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <div class="pe-2 ps-4 flex flex-wrap gap-2 max-w-full min-h-10 min-w-0 items-center">
          <SegmentGroup.Root
            value={props.data.target.id}
            onValueChange={(details) => details.value !== null && props.onTarget(details.value)}
            class={`${SEGMENT_ROOT} scrollbar-hidden py-1 max-w-full min-w-0 overflow-x-auto`}
          >
            <SegmentGroup.Label class={SEGMENT_LABEL}>Viewport</SegmentGroup.Label>
            <SegmentGroup.Indicator class={SEGMENT_INDICATOR} />
            <For each={targetIds()}>
              {(id) => (
                <Show when={tabById(id)}>
                  {(tab) => (
                    <SegmentGroup.Item value={id} class={`${SEGMENT_ITEM} text-sm!`}>
                      <span class={widthIcon(tab().target.width)} aria-hidden="true" />
                      <SegmentGroup.ItemText class="tabular-nums">
                        {tab().target.width} · {widthSummary(tab())}
                      </SegmentGroup.ItemText>
                      <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                  )}
                </Show>
              )}
            </For>
          </SegmentGroup.Root>
          <span class="mx-1 border-s border-base h-5 hidden sm:block" aria-hidden="true" />
          <RunButton running={props.running} onRun={props.onRun} />
        </div>
      </div>
      <div class="p-2 border-t border-base flex flex-wrap gap-2 items-center">
        <CheckChip
          checked={choice().above}
          icon="i-ph-warning-circle-duotone text-orange-600 dark:text-orange-400"
          label="Off"
          onToggle={(above) => props.onFilter(above ? 'all' : 'none')}
        />
        <TooltipIconButton
          tooltip="Select all"
          class="btn-icon-compact rounded-md"
          onClick={() => props.onFilter('all')}
        >
          <span class="i-ph-selection-all-duotone" aria-hidden="true" />
        </TooltipIconButton>
      </div>
      <div class="p-2 pe-4 border-t border-base flex flex-wrap gap-2 items-center">
        <SegmentGroup.Root
          value={props.view}
          onValueChange={(details) => details.value !== null && props.onView(parseView(details.value))}
          class={SEGMENT_ROOT}
        >
          <SegmentGroup.Label class={`${SEGMENT_LABEL} ps-2`}>View as</SegmentGroup.Label>
          <SegmentGroup.Indicator class={SEGMENT_INDICATOR} />
          <For each={VIEW_ITEMS}>
            {(item) => (
              <SegmentGroup.Item value={item.view} class={`${SEGMENT_ITEM} text-base!`}>
                <span class={item.icon} aria-hidden="true" />
                <SegmentGroup.ItemText>{item.label}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
        <span class="text-sm ms-auto flex flex-wrap gap-2 min-w-0 items-center justify-end">
          <Show when={stale(props.data) && !props.running}>
            <span class="badge badge-color-amber shrink-0">stale: source changed</span>
          </Show>
          <span class="min-w-0 truncate">
            <span class="font-mono op-75">{props.data.target.route}</span>
            <Show when={props.data.ranAt} fallback={<span class="op-fade">{' · not diffed yet'}</span>}>
              {(at) => (
                <span class="op-fade tabular-nums">
                  {' · diffed '}
                  <RelativeTime value={new Date(at())} />
                </span>
              )}
            </Show>
          </span>
        </span>
      </div>
    </div>
  )
}
