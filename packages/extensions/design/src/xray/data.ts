import {makeRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {StatusDotTone} from '@conciv/ui-kit-system'
import type {ComponentReport, DiffReport} from '../shared/defs.js'
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
  tone: StatusDotTone
}

export type WidthTab = {target: TargetRecord; tone: StatusDotTone}

export type XrayImages = {target: string; live: string | null; diff: string | null}

export type XrayData = {
  target: TargetRecord
  report: DiffReport | null
  images: XrayImages
  widths: WidthTab[]
  ranAt: number | null
}

export type ReportResponse = {target: TargetRecord; report: DiffReport | null; targetImage: string}

const SEVERE_MISMATCH = 0.015
const EXTENSION_SLUG = 'design'

export function sourceLabel(source: SourceLoc | null): string {
  if (source === null) return 'no source'
  return `${source.file}:${source.line}:${source.column}`
}

function componentTone(component: ComponentReport): StatusDotTone {
  if (component.deltas.length === 0) return 'success'
  return component.mismatch >= SEVERE_MISMATCH ? 'danger' : 'warn'
}

export function reportRows(report: DiffReport | null): Row[] {
  if (report === null) return []
  const components = report.components.map(
    (component): Row => ({
      key: component.selector,
      label: sourceLabel(component.source),
      source: component.source,
      tag: component.tag,
      selector: component.selector,
      live: component.live,
      target: component.target,
      mismatch: component.mismatch,
      deltas: component.deltas,
      unmatched: null,
      tone: componentTone(component),
    }),
  )
  const unmatched = report.unmatched.map(
    (region, index): Row => ({
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
      tone: 'danger',
    }),
  )
  return [...components, ...unmatched]
}

export function aboveTolerance(row: Row): boolean {
  return row.unmatched !== null || row.deltas.length > 0
}

function reportTone(report: DiffReport | null): StatusDotTone {
  const tones = reportRows(report).map((row) => row.tone)
  if (report === null) return 'idle'
  if (tones.includes('danger')) return 'danger'
  return tones.includes('warn') ? 'warn' : 'success'
}

function runTime(report: DiffReport | null): number | null {
  const name = report?.livePath.split('/').at(-1)
  if (name === undefined) return null
  const at = Number(name.split('-')[1])
  return Number.isFinite(at) ? at : null
}

function engineApiBase(): string {
  return new URL('../../../', window.location.href).href.slice(0, -1)
}

function fileUrl(path: string): string {
  return new URL(`files/${path}`, window.location.href).href
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
      .map((sibling) => ({target: sibling.target, tone: reportTone(sibling.report)}))
      .toSorted((a, b) => a.target.width - b.target.width),
    ranAt: runTime(current.report),
  }
  return data
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

async function sessionClient() {
  const apiBase = engineApiBase()
  const {sessionId} = await makeRpcClient(apiBase).sessions.resolve({})
  return makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
}

export async function runDiff(target: TargetRecord): Promise<void> {
  const rpc = await sessionClient()
  await rpc.registry.call({name: 'design_diff', input: {target: target.id, width: target.width}})
}

export async function openInEditor(source: SourceLoc): Promise<void> {
  const rpc = await sessionClient()
  await rpc.editor.open({file: source.file, line: source.line})
}

export function diffCommand(target: TargetRecord): string {
  return `conciv tools design diff --target ${target.id} --width ${target.width}`
}
