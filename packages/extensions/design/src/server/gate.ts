import {formatHex8, parse} from 'culori'
import {z} from 'zod'
import type {Box, Counts, Coverage, DesignNode, GateRow, LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import type {renderersOf} from './renderers.js'

export function gateOf(input: {root: DesignNode; renderers: ReturnType<typeof renderersOf>}): Gate {
  const {renderers} = input
  const records = recordsOf(input.root)
  const byId = new Map(records.map((record) => [record.id, record]))
  const first = (id: string): LiveComponent | undefined => renderers.of(id)[0]
  const rows = records.flatMap((record) => {
    const element = first(record.id)
    if (element === undefined) return []
    const parent = record.parent === null ? undefined : byId.get(record.parent)
    const parentElement = parent === undefined ? undefined : first(parent.id)
    return rowsOf({record, element, parent, parentElement}).map((row) =>
      worded({record, named: renderers.named(record.id), row}),
    )
  })
  const coverage: Coverage = {
    nodes: records.length,
    mapped: records.filter((record) => renderers.mapped(record.id)).length,
    rendered: records.filter((record) => first(record.id) !== undefined).length,
    missing: records.filter((record) => first(record.id) === undefined).map((record) => record.id),
    notRendered: records
      .filter((record) => renderers.mapped(record.id) && first(record.id) === undefined)
      .map((record) => record.id),
    candidates: [],
    provisional: 0,
    dupes: records.filter((record) => renderers.of(record.id).length > 1).map((record) => record.id),
  }
  return {rows: rows.filter((row) => row.magnitude !== 'slightly'), coverage, counts: countsOf(rows)}
}

type Gate = {rows: GateRow[]; coverage: Coverage; counts: Counts}

type Row = {head: string; measured?: {a: number; b: number; position: boolean}; paint?: boolean}

type Record = {
  id: string
  kind: string
  name: string
  box: Box
  parent: string | null
  leaf: boolean
  direction?: 'row' | 'column'
  fill: {color: string; text: boolean} | null
}

const FAR_PX = 24
const CONTAINER_TOLERANCE = 0.08
const LEAF_TOLERANCE = 0.2
const HEIGHT_SLACK = 0.07
const FLAT_PX = 2
const SHIFT_PX = 12
const NEAR_PX = 32
const SLIGHT_PX = 8
const SLIGHT_SHARE = 0.15
const NOTICE_SHARE = 0.4
const NOTICE_PX = 96
const FLAT_KINDS = new Set(['text', 'line'])
const SOLID = 'solid'
const CLEAR = 'transparent'
const FlowSchema = z.object({mode: z.enum(['HORIZONTAL', 'VERTICAL']), gap: z.number(), pad: z.array(z.number())})
const FillsSchema = z.array(z.object({type: z.string(), color: z.string().optional(), opacity: z.number().optional()}))

function recordsOf(root: DesignNode): Record[] {
  return [...walk(root)].flatMap(({node, parent}): Record[] => {
    const box = {...(node.figma?.box ?? node.box), h: heightOf(node)}
    const gate = node.gate ?? (node.figma === undefined ? imageGate({node, parent}) : undefined)
    if (gate === undefined) return []
    return [
      {
        id: node.id,
        kind: gate.kind,
        name: node.figma?.name ?? '',
        box,
        parent: gate.parent,
        leaf: gate.leaf,
        ...(gate.direction === undefined ? {} : {direction: gate.direction}),
        fill: fillOf(node),
      },
    ]
  })
}

function heightOf(node: DesignNode): number {
  const box = node.figma?.box ?? node.box
  const flow = FlowSchema.safeParse(node.figma?.fields.layout)
  const kids = node.children.filter((kid) => kid.figma?.absolute !== true)
  if (!flow.success || kids.length === 0 || !inFlow({kids, ...flow.data})) return box.h
  const [top = 0, , bottom = 0] = flow.data.pad
  const heights = kids.map(heightOf)
  const content =
    flow.data.mode === 'VERTICAL'
      ? heights.reduce((sum, h) => sum + h, 0) + flow.data.gap * (kids.length - 1)
      : Math.max(...heights)
  return Math.max(box.h, top + content + bottom)
}

function inFlow(input: {kids: DesignNode[]; mode: 'HORIZONTAL' | 'VERTICAL'; gap: number}): boolean {
  const {kids, gap} = input
  const axis = input.mode === 'VERTICAL' ? ('y' as const) : ('x' as const)
  const size = input.mode === 'VERTICAL' ? ('h' as const) : ('w' as const)
  return kids.every((kid, index) => {
    const before = kids[index - 1]
    if (before === undefined) return true
    const a = before.figma?.box ?? before.box
    const b = kid.figma?.box ?? kid.box
    return Math.abs(b[axis] - (a[axis] + a[size] + gap)) <= designConfig.tolerances.geometryPx
  })
}

function fillOf(node: DesignNode): Record['fill'] {
  if (node.kind === 'image' || node.figma?.fields.image === true) return null
  const fills = FillsSchema.safeParse(node.figma?.fields.fills)
  const [fill] = fills.success ? fills.data : []
  if (fill === undefined || fills.data?.length !== 1 || fill.type !== SOLID || fill.color === undefined) return null
  const parsed = parse(fill.color)
  if (parsed === undefined) return null
  return {color: paintKey(formatHex8({...parsed, alpha: fill.opacity ?? 1})), text: node.kind === 'text'}
}

function paintKey(hex: string): string {
  return hex.endsWith('00') ? CLEAR : hex
}

function paintRows(input: {label: string; r: Record; d: LiveComponent}): Row[] {
  const {label, r, d} = input
  if (r.fill === null) return []
  const shown = r.fill.text ? d.styles.color : d.styles.background
  const parsed = parse(shown)
  const live = parsed === undefined ? shown : paintKey(formatHex8(parsed))
  if (live === r.fill.color) return []
  const property = r.fill.text ? 'color' : 'background-color'
  return [{head: `${label}: paint ${property} ${live} where the design fills ${r.fill.color}`, paint: true}]
}

function imageGate(input: {node: DesignNode; parent: DesignNode | null}): NonNullable<DesignNode['gate']> {
  const {node, parent} = input
  return {kind: node.kind, leaf: node.children.length === 0, parent: parent?.id ?? null}
}

function rowsOf(input: {
  record: Record
  element: LiveComponent
  parent: Record | undefined
  parentElement: LiveComponent | undefined
}): Row[] {
  const {record: r, element: d, parent, parentElement: pd} = input
  const label = `${r.kind} ${r.name} [${r.id}] ${d.tag}.${d.hints[0] ?? ''}`
  const container = !r.leaf || r.kind === 'wrapper' || r.kind === 'layered'
  const pinsWidth = d.styles.sizing.width === 'fixed'
  const pinsHeight = d.styles.sizing.height === 'fixed'
  const box = rounded(d.bounds)
  const tol = r.leaf ? LEAF_TOLERANCE : CONTAINER_TOLERANCE
  const farW = container && Math.abs(box.w - r.box.w) > FAR_PX
  const farH = container && Math.abs(box.h - r.box.h) > FAR_PX
  const ww = widthWord({rendered: box.w, design: r.box.w, tol, far: farW})
  const hh = box.h / r.box.h
  const flat = FLAT_KINDS.has(r.kind)
  const want = r.direction === 'row' ? 'row' : 'column'
  const dir = d.styles.flexDirection
  return [
    ...(container && pinsWidth ? [{head: `${label}: pins width; the design box fills or hugs`}] : []),
    ...(container && pinsHeight
      ? [{head: `${label}: pins height; the design box takes its height from its children`}]
      : []),
    ...(r.kind === 'text' && (pinsWidth || pinsHeight)
      ? [{head: `${label}: text has a pixel size; it should fit its text`}]
      : []),
    ...(ww !== null && !flat ? [{head: `${label}: ${ww}`, measured: {a: box.w, b: r.box.w, position: false}}] : []),
    ...(!flat && r.box.h > FLAT_PX && (hh < 1 - tol - HEIGHT_SLACK || hh > 1 + tol + HEIGHT_SLACK || farH)
      ? [
          {
            head: `${label}: box ${hh < 1 ? 'shorter' : 'taller'} than the design`,
            measured: {a: box.h, b: r.box.h, position: false},
          },
        ]
      : []),
    ...(r.direction !== undefined && d.styles.display.includes('flex') && !dir.startsWith(want)
      ? [{head: `${label}: flex-direction ${dir}; the design is a ${want}`}]
      : []),
    ...(parent === undefined || pd === undefined ? [] : positionRows({label, r, box, parent, pd})),
    ...paintRows({label, r, d}),
  ]
}

function widthWord(input: {rendered: number; design: number; tol: number; far: boolean}): string | null {
  const {rendered, design, tol, far} = input
  const ratio = rendered / design
  if (ratio < 1 - tol || (far && rendered < design)) return 'box narrower than the design'
  if (ratio > 1 + tol || (far && rendered > design)) return 'box wider than the design'
  return null
}

function positionRows(input: {label: string; r: Record; box: Box; parent: Record; pd: LiveComponent}): Row[] {
  const {label, r, box, parent, pd} = input
  const parentBox = rounded(pd.bounds)
  const dl = box.x - parentBox.x
  const rl = r.box.x - parent.box.x
  const dt = box.y - parentBox.y
  const rt = r.box.y - parent.box.y
  return [
    ...(Math.abs(dl - rl) > SHIFT_PX
      ? [
          {
            head: `${label}: sits ${dl - rl > 0 ? 'further right' : 'further left'} inside its parent than the design`,
            measured: {a: dl, b: rl, position: true},
          },
        ]
      : []),
    ...(Math.abs(dt - rt) > SHIFT_PX
      ? [
          {
            head: `${label}: sits ${dt - rt > 0 ? 'lower' : 'higher'} inside its parent than the design`,
            measured: {a: dt, b: rt, position: true},
          },
        ]
      : []),
  ]
}

function worded(input: {
  record: Record
  named: Pick<GateRow, 'selector' | 'source' | 'confidence' | 'margin'>
  row: Row
}): GateRow {
  const {record, named, row} = input
  const base = {node: record.id, ...named, kind: record.kind, name: record.name}
  if (row.paint === true) return {...base, text: row.head, magnitude: 'much'}
  if (row.measured === undefined)
    return {...base, text: row.head, magnitude: row.head.includes('pins') ? 'pin' : 'other'}
  const magnitude = magnitudeOf(row.measured)
  return {...base, text: `${row.head} (${magnitude})`, magnitude}
}

function magnitudeOf(input: {a: number; b: number; position: boolean}): 'much' | 'noticeably' | 'slightly' {
  const d = Math.abs(input.a - input.b)
  if (input.position) return d < SHIFT_PX ? 'slightly' : d < NEAR_PX ? 'noticeably' : 'much'
  const r = d / Math.max(Math.abs(input.b), 1)
  if (d < SLIGHT_PX || (r < SLIGHT_SHARE && d < NEAR_PX)) return 'slightly'
  return r < NOTICE_SHARE && d < NOTICE_PX ? 'noticeably' : 'much'
}

function countsOf(rows: GateRow[]): Counts {
  const count = (magnitude: GateRow['magnitude']): number => rows.filter((row) => row.magnitude === magnitude).length
  return {
    much: count('much'),
    noticeably: count('noticeably'),
    slightly: count('slightly'),
    pins: count('pin'),
    other: count('other'),
    reflow: count('reflow'),
    rows: rows.length,
  }
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}
