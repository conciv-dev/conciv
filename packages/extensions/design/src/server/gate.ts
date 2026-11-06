import type {Box, Counts, Coverage, DesignNode, GateRow, LiveComponent} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import type {renderersOf} from './renderers.js'

export function gateOf(input: {
  root: DesignNode
  renderers: ReturnType<typeof renderersOf>
  live: LiveComponent
}): Gate {
  const {renderers} = input
  const records = recordsOf(input.root)
  const byId = new Map(records.map((record) => [record.id, record]))
  const first = (id: string): LiveComponent | undefined => renderers.of(id)[0]
  const rows = records.flatMap((record) => {
    const element = first(record.id)
    if (element === undefined) return []
    const parent = record.parent === null ? undefined : byId.get(record.parent)
    const parentElement = parent === undefined ? undefined : first(parent.id)
    return rowsOf({record, element, parent, parentElement}).map((row) => worded({record, element, row}))
  })
  const known = new Set([...walk(input.root)].map(({node}) => node.id))
  const coverage: Coverage = {
    nodes: records.length,
    mapped: records.filter((record) => renderers.mapped(record.id)).length,
    rendered: records.filter((record) => first(record.id) !== undefined).length,
    missing: records.filter((record) => first(record.id) === undefined).map((record) => record.id),
    unknown: [...walk(input.live)].flatMap(({node}) =>
      node.figma === null || known.has(node.figma) ? [] : [node.figma],
    ),
    dupes: records.filter((record) => renderers.of(record.id).length > 1).map((record) => record.id),
  }
  return {rows: rows.filter((row) => row.magnitude !== 'slightly'), coverage, counts: countsOf(rows)}
}

type Gate = {rows: GateRow[]; coverage: Coverage; counts: Counts}

type Row = {head: string; measured?: {a: number; b: number; position: boolean}}

type Record = {
  id: string
  kind: string
  name: string
  box: Box
  parent: string | null
  leaf: boolean
  direction?: 'row' | 'column'
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

function recordsOf(root: DesignNode): Record[] {
  return [...walk(root)].flatMap(({node, parent}): Record[] => {
    const box = node.figma?.box ?? node.box
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
      },
    ]
  })
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

function worded(input: {record: Record; element: LiveComponent; row: Row}): GateRow {
  const {record, element, row} = input
  const base = {node: record.id, key: element.key, kind: record.kind, name: record.name}
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
    rows: rows.length,
  }
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}
