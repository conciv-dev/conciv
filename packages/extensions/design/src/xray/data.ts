import {makeRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {aboveTolerance, componentAboveTolerance} from '../shared/above.js'
import {SOURCE_ATTR} from '../shared/source-attr.js'
import type {ComponentReport, DeltaKindName, DiffReport} from '../shared/defs.js'
import type {Box, SourceLoc, TargetRecord} from '../shared/types.js'
import type {XrayRouter} from '../server/xray-routes.js'

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
  unmatched: 'missing' | 'extra' | null
}

export type WidthTab = {target: TargetRecord; off: number | null}

export type XrayImages = {target: string; live: string | null; diff: string | null}

export type XrayData = {
  target: TargetRecord
  report: DiffReport | null
  images: XrayImages
  widths: WidthTab[]
  ranAt: number | null
  sourceChangedAt: number | null
}

export type ReportResponse = {
  target: TargetRecord
  report: DiffReport | null
  targetImage: string
  sourceChangedAt: number | null
}

const EXTENSION_SLUG = 'design'

export function sourceLabel(source: SourceLoc | null): string {
  if (source === null) return 'no source'
  return `${source.file}:${source.line}`
}

export function reportRows(report: DiffReport | null): Row[] {
  if (report === null) return []
  const components = report.components.map((component, index): Row => ({
    key: `${component.selector}#${index}`,
    label: sourceLabel(component.source),
    source: component.source,
    tag: component.tag,
    selector: component.selector.startsWith(`[${SOURCE_ATTR}=`) ? component.tag : component.selector,
    live: component.live,
    target: component.target,
    mismatch: component.mismatch,
    deltas: component.deltas,
    unmatched: null,
  }))
  const unmatched = report.unmatched.map((region, index): Row => ({
    key: `unmatched-${index}`,
    label: region.source === undefined ? `${region.kind} region` : sourceLabel(region.source),
    source: region.source ?? null,
    tag: '',
    selector: '',
    live: region.live ?? null,
    target: region.target ?? null,
    mismatch: null,
    deltas: [],
    unmatched: region.kind,
  }))
  return [...components, ...unmatched]
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

const PAGE_SEGMENT = '/xray'

export function pagePrefix(): string {
  const path = window.location.pathname
  const at = path.indexOf(PAGE_SEGMENT)
  return at === -1 ? '' : path.slice(0, at + PAGE_SEGMENT.length)
}

function pageUrl(): URL {
  return new URL(pagePrefix(), window.location.origin)
}

function engineApiBase(): string {
  return new URL('../../../', pageUrl()).href.slice(0, -1)
}

function fileUrl(path: string): string {
  return new URL(`files/${path}`, pageUrl()).href
}

function designClient() {
  return makeExtRpcClient<XrayRouter>(engineApiBase(), EXTENSION_SLUG)
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
    ranAt: runTime(current.report),
    sourceChangedAt: current.sourceChangedAt,
  }
  return data
}

export function stale(data: XrayData): boolean {
  return data.sourceChangedAt !== null && data.ranAt !== null && data.sourceChangedAt > data.ranAt
}

export async function loadXray(input: {id: string}): Promise<XrayData> {
  const client = designClient()
  const current: ReportResponse = await client.xray.report({id: input.id})
  const targets = await client.xray.targets({route: current.target.route})
  const siblings = await Promise.all(
    targets.map((target) => (target.id === current.target.id ? current : client.xray.report({id: target.id}))),
  )
  return assemble({current, siblings, image: fileUrl})
}

async function sessionClient(session: string | undefined) {
  const apiBase = engineApiBase()
  const sessionId = session ?? (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  return makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
}

export async function runDiff(input: {target: TargetRecord; session: string | undefined}): Promise<void> {
  const rpc = await sessionClient(input.session)
  await rpc.registry.call({name: 'design_diff', input: {target: input.target.id, width: input.target.width}})
}

export async function openInEditor(input: {source: SourceLoc; session: string | undefined}): Promise<void> {
  const rpc = await sessionClient(input.session)
  await rpc.editor.open({file: input.source.file, line: input.source.line})
}

export function diffCommand(target: TargetRecord): string {
  return `conciv tools design diff --target ${target.id} --width ${target.width}`
}

export const FILTERS = ['all', 'above', 'match', 'none'] as const
export type Filter = (typeof FILTERS)[number]

export type FilterChoice = {above: boolean; match: boolean}

export function filterChoice(filter: Filter): FilterChoice {
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

const SHARE = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1})
const AMOUNT = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})

export type BadgeColor = 'orange' | 'red' | 'amber'

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

export function rowTitle(row: Row): string {
  return row.source === null ? rowName(row) : baseName(row.source.file)
}

export function rowName(row: Row): string {
  if (row.source !== null) return `${baseName(row.source.file)} ${row.tag}`.trim()
  if (row.selector !== '') return row.selector
  return row.label
}

export function deltaValue(input: {delta: Delta; value: number | string}): string {
  if (typeof input.value === 'string') return input.value
  return input.delta.kind === 'fill' ? SHARE.format(input.value) : AMOUNT.format(input.value)
}

export function badgeText(delta: Delta): string {
  return `${delta.kind} ${deltaValue({delta, value: delta.live})} → ${deltaValue({delta, value: delta.target})}`
}

export function badgeColor(delta: Delta): BadgeColor {
  return BADGE_COLOR[delta.kind] ?? 'orange'
}
