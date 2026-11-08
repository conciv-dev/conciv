import {formatHex, interpolate, parse} from 'culori'
import {z} from 'zod'
import type {Box, Counts, Coverage, Design, DesignNode, GateRow, LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import type {readIds} from '../shared/id-tree.js'
import {nodeLooks} from './node-look.js'

export function gateOf(input: {design: Design; reads: ReturnType<typeof readIds>; live: LiveComponent}): Gate {
  const {reads} = input
  const records = recordsOf(input.design.root)
  const byId = new Map(records.map((record) => [record.id, record]))
  const first = (id: string): LiveComponent | undefined => reads.of(id)[0]
  const grouped = Map.groupBy(records, (record) => record.parent ?? '')
  const kidsOf = (id: string): Placed[] =>
    (grouped.get(id) ?? []).map((record) => {
      const element = first(record.id)
      return {record, box: element === undefined ? null : rounded(element.bounds)}
    })
  const rows = records.flatMap((record) => {
    const element = first(record.id)
    if (element === undefined) return []
    const parent = record.parent === null ? undefined : byId.get(record.parent)
    const parentElement = parent === undefined ? undefined : first(parent.id)
    return rowsOf({record, element, parent, parentElement, kidsOf}).map((row) =>
      worded({record, named: reads.named(record.id), row}),
    )
  })
  const coverage: Coverage = {
    nodes: records.length,
    mapped: records.filter((record) => reads.mapped(record.id)).length,
    rendered: records.filter((record) => first(record.id) !== undefined).length,
    missing: records.filter((record) => first(record.id) === undefined).map((record) => record.id),
    notRendered: records
      .filter((record) => reads.mapped(record.id) && first(record.id) === undefined)
      .map((record) => record.id),
    candidates: [],
    revoted: 0,
    dupes: records.filter((record) => reads.of(record.id).length > 1).map((record) => record.id),
  }
  const painted = [...rows, ...lookRows({design: input.design, reads, live: input.live})]
  return {rows: painted.filter((row) => row.magnitude !== 'slightly'), coverage, counts: countsOf(painted)}
}

type Gate = {rows: GateRow[]; coverage: Coverage; counts: Counts}

type Placed = {record: Record; box: Box | null}

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
const SHIFT_PX = designConfig.tolerances.slightShiftPx
const NEAR_PX = 32
const SLIGHT_PX = 8
const SLIGHT_SHARE = 0.15
const NOTICE_SHARE = 0.4
const NOTICE_PX = 96
const SAME_PX = designConfig.tolerances.geometryPx
const NAMED = designConfig.tolerances.figmaPair.candidatesKept
const AXES = {
  w: {property: 'width', less: 'narrower', more: 'wider', edge: 'x'},
  h: {property: 'height', less: 'shorter', more: 'taller', edge: 'y'},
} as const
const FLAT_KINDS = new Set(['text', 'line'])
const FlowSchema = z.object({mode: z.enum(['HORIZONTAL', 'VERTICAL']), gap: z.number(), pad: z.array(z.number())})

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

function imageGate(input: {node: DesignNode; parent: DesignNode | null}): NonNullable<DesignNode['gate']> {
  const {node, parent} = input
  return {kind: node.kind, leaf: node.children.length === 0, parent: parent?.id ?? null}
}

function rowsOf(input: {
  record: Record
  element: LiveComponent
  parent: Record | undefined
  parentElement: LiveComponent | undefined
  kidsOf: (id: string) => Placed[]
}): Row[] {
  const {record: r, element: d, parent, parentElement: pd, kidsOf} = input
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
    ...(ww !== null && !flat
      ? [
          {
            head: `${label}: ${contentWord({r, d, kids: kidsOf(r.id), axis: 'w'}) ?? ww}`,
            measured: {a: box.w, b: r.box.w, position: false},
          },
        ]
      : []),
    ...(!flat && r.box.h > FLAT_PX && (hh < 1 - tol - HEIGHT_SLACK || hh > 1 + tol + HEIGHT_SLACK || farH)
      ? [
          {
            head: `${label}: ${contentWord({r, d, kids: kidsOf(r.id), axis: 'h'}) ?? `box ${hh < 1 ? 'shorter' : 'taller'} than the design`}`,
            measured: {a: box.h, b: r.box.h, position: false},
          },
        ]
      : []),
    ...(r.direction !== undefined && d.styles.display.includes('flex') && !dir.startsWith(want)
      ? [{head: `${label}: flex-direction ${dir}; the design is a ${want}`}]
      : []),
    ...(parent === undefined || pd === undefined
      ? []
      : positionRows({label, r, d, box, parent, pd, siblings: kidsOf(parent.id)})),
  ]
}

function widthWord(input: {rendered: number; design: number; tol: number; far: boolean}): string | null {
  const {rendered, design, tol, far} = input
  const ratio = rendered / design
  if (ratio < 1 - tol || (far && rendered < design)) return 'box narrower than the design'
  if (ratio > 1 + tol || (far && rendered > design)) return 'box wider than the design'
  return null
}

function contentWord(input: {r: Record; d: LiveComponent; kids: Placed[]; axis: 'w' | 'h'}): string | null {
  const {r, d, axis} = input
  const words = AXES[axis]
  if (r.leaf || d.styles.sizing[words.property] !== 'auto') return null
  const less = rounded(d.bounds)[axis] < r.box[axis]
  const named = input.kids
    .flatMap((kid) => (kid.box === null ? [] : [{kid, by: kid.box[axis] - kid.record.box[axis]}]))
    .filter(({by}) => (less ? by < -SAME_PX : by > SAME_PX))
    .toSorted((a, b) => Math.abs(b.by) - Math.abs(a.by))
    .slice(0, NAMED)
  if (named.length === 0) return null
  const list = named.map(({kid}) => `${kid.record.name} [${kid.record.id}]`).join(', ')
  return `its content is ${less ? words.less : words.more} than the design: ${list}`
}

function placedBy(input: {
  r: Record
  d: LiveComponent
  pd: LiveComponent
  siblings: Placed[]
  axis: 'w' | 'h'
  off: number
}): string {
  const {r, pd, axis, off} = input
  const words = AXES[axis]
  const flow = pd.styles.flexDirection.startsWith('column') ? 'h' : 'w'
  if (!pd.styles.display.includes('flex') || flow !== axis) return ''
  const at = pd.children.findIndex((child) => child.path === input.d.path)
  const shown = at < 0 ? [] : pd.children.slice(0, at).toReversed()
  const found = input.siblings
    .filter((kid) => kid.record.box[words.edge] < r.box[words.edge])
    .toSorted((a, b) => b.record.box[words.edge] - a.record.box[words.edge])
    .flatMap((kid, index) => {
      const fallback = shown[index]
      const box = kid.box ?? (fallback === undefined ? null : rounded(fallback.bounds))
      return box === null ? [] : [{kid, by: box[axis] - kid.record.box[axis]}]
    })
    .find(({by}) => Math.abs(by - off) <= SAME_PX)
  if (found === undefined) return ''
  const {record} = found.kid
  return `, placed by ${record.name} [${record.id}] which is ${found.by > 0 ? words.more : words.less} than the design`
}

function positionRows(input: {
  label: string
  r: Record
  box: Box
  parent: Record
  d: LiveComponent
  pd: LiveComponent
  siblings: Placed[]
}): Row[] {
  const {label, r, d, box, parent, pd, siblings} = input
  const parentBox = rounded(pd.bounds)
  const dl = box.x - parentBox.x
  const rl = r.box.x - parent.box.x
  const dt = box.y - parentBox.y
  const rt = r.box.y - parent.box.y
  return [
    ...(Math.abs(dl - rl) > SHIFT_PX
      ? [
          {
            head: `${label}: sits ${dl - rl > 0 ? 'further right' : 'further left'} inside its parent than the design${placedBy({r, d, pd, siblings, axis: 'w', off: dl - rl})}`,
            measured: {a: dl, b: rl, position: true},
          },
        ]
      : []),
    ...(Math.abs(dt - rt) > SHIFT_PX
      ? [
          {
            head: `${label}: sits ${dt - rt > 0 ? 'lower' : 'higher'} inside its parent than the design${placedBy({r, d, pd, siblings, axis: 'h', off: dt - rt})}`,
            measured: {a: dt, b: rt, position: true},
          },
        ]
      : []),
  ]
}

function worded(input: {
  record: Record
  named: Pick<GateRow, 'id' | 'selector' | 'source' | 'confidence' | 'margin'>
  row: Row
}): GateRow {
  const {record, named, row} = input
  const base = {node: record.id, ...named, kind: record.kind, name: record.name}
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
    paint: count('paint'),
    rows: rows.length - count('slightly'),
  }
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}

type Look = ReturnType<typeof nodeLooks>[number]

type Seen = {look: Look; element: LiveComponent; under: string}

type Compared = {kind: PaintKind; expected: string; found: string; token: string | null}

type PaintKind =
  | 'fill'
  | 'text color'
  | 'font family'
  | 'font weight'
  | 'font size'
  | 'line height'
  | 'radius'
  | 'border'
  | 'opacity'

const PX = designConfig.tolerances.geometryPx
const COLOR_DELTA = designConfig.tolerances.colorDeltaE
const distance = designConfig.colorMetrics.ciede2000
const WEIGHT_STEP = 100
const QUOTES = ['"', "'"]

function lookRows(input: {design: Design; reads: ReturnType<typeof readIds>; live: LiveComponent}): GateRow[] {
  const {reads} = input
  const parents = new Map([...walk(input.live)].map(({node, parent}) => [node, parent]))
  const behind = (element: LiveComponent | null | undefined): string => {
    if (element === null || element === undefined) return WHITE
    return opaque(element.styles.background) ? element.styles.background : behind(parents.get(element))
  }
  const looks = nodeLooks(input.design)
  const assets = new Set(looks.flatMap((look) => (look.asset === null ? [] : [look.node])))
  const drawn = looks.reduce((inside, look) => {
    const parent = look.within ?? ''
    return inside.has(parent) || assets.has(parent) ? inside.add(look.node) : inside
  }, new Set<string>())
  return looks.flatMap((look) => {
    if (drawn.has(look.node)) return []
    const element = reads.of(look.node)[0]
    if (element === undefined) return []
    const seen = {look, element, under: behind(parents.get(element))}
    return compared(seen).map((found) => ({
      node: look.node,
      ...reads.named(look.node),
      kind: found.kind,
      name: look.name,
      text: `wrong ${found.kind} at [${look.node}]: ${found.token === null ? found.expected : `${found.token} (${found.expected})`} expected, ${found.found} found`,
      magnitude: 'paint',
      token: found.token,
    }))
  })
}

function compared(seen: Seen): Compared[] {
  const {look} = seen
  if (look.image || look.asset !== null) return []
  if (look.type === 'TEXT') return textRows(seen)
  return [...fillRows(seen), ...radiusRows(seen), ...borderRows(seen), ...opacityRows(seen)]
}

function fillRows(seen: Seen): Compared[] {
  const {look, element, under} = seen
  const token = look.token_fill
  const ends = look.gradient === null ? null : endsOf({gradient: look.gradient, under})
  if (look.fill_kind === 'gradient' && ends !== null && !near({a: ends.from, b: ends.to})) {
    const found = element.styles.gradient
    const {from, to} = ends
    const shownFrom = found === null ? '' : blended({color: found.from, over: under, alpha: 1})
    const shownTo = found === null ? '' : blended({color: found.to, over: under, alpha: 1})
    if (found !== null && near({a: shownFrom, b: from}) && near({a: shownTo, b: to})) return []
    const shown = found === null ? shownColor({element, under}) : `${found.from} to ${found.to}`
    return [{kind: 'fill', expected: `${from} to ${to}`, found: shown, token}]
  }
  if (look.fill_kind === 'none' || look.fill === null) return []
  const expected = ends?.from ?? blended({color: look.fill, over: under, alpha: look.fill_opacity ?? 1})
  const found = shownColor({element, under})
  return near({a: found, b: expected}) ? [] : [{kind: 'fill', expected, found, token}]
}

function textRows(seen: Seen): Compared[] {
  const {look, element} = seen
  const {styles} = element
  const token = look.token_font
  const family = firstFamily(styles.fontFamily)
  const color = look.fill === null ? null : blended({color: look.fill, over: seen.under, alpha: look.fill_opacity ?? 1})
  const shown = blended({color: styles.color, over: seen.under, alpha: styles.opacity})
  return [
    ...(color === null || near({a: shown, b: color})
      ? []
      : [{kind: 'text color' as const, expected: color, found: shown, token: look.token_fill}]),
    ...(look.font_family === null || family === look.font_family.toLowerCase()
      ? []
      : [{kind: 'font family' as const, expected: look.font_family, found: family, token}]),
    ...(look.font_weight === null || hundred(look.font_weight) === hundred(styles.fontWeight)
      ? []
      : [{kind: 'font weight' as const, expected: `${look.font_weight}`, found: `${styles.fontWeight}`, token}]),
    ...pxRow({kind: 'font size', expected: look.font_size, found: styles.fontSize, token}),
    ...pxRow({kind: 'line height', expected: look.line_height, found: styles.lineHeight, token}),
  ]
}

function radiusRows(seen: Seen): Compared[] {
  const {look, element} = seen
  const drawn = look.fill_kind !== 'none' || look.stroke !== null
  if (!drawn) return []
  return pxRow({kind: 'radius', expected: look.radius ?? 0, found: element.styles.radius, token: look.token_radius})
}

function borderRows(seen: Seen): Compared[] {
  const {look, element} = seen
  if (look.stroke === null) return []
  const {border} = element.styles
  const weight = look.stroke_weight ?? 1
  const shown = border.style === 'none' || border.width === 0 ? 'none' : `${border.width}px ${border.color}`
  const same = border.width === weight && near({a: border.color, b: look.stroke})
  return same ? [] : [{kind: 'border', expected: `${weight}px ${look.stroke}`, found: shown, token: look.token_stroke}]
}

function opacityRows(seen: Seen): Compared[] {
  const {look, element, under} = seen
  if (look.fill_kind !== 'solid' || look.fill === null) return []
  const own = look.opacity ?? 1
  const background = opaque(element.styles.background) ? element.styles.background : look.fill
  const expected = blended({color: look.fill, over: under, alpha: own * (look.fill_opacity ?? 1)})
  const found = blended({color: background, over: under, alpha: element.styles.opacity})
  if (near({a: expected, b: found}) || own === element.styles.opacity) return []
  return [{kind: 'opacity', expected: `${own} ${expected}`, found: `${element.styles.opacity} ${found}`, token: null}]
}

function endsOf(input: {gradient: NonNullable<Look['gradient']>; under: string}): {from: string; to: string} {
  const {gradient, under} = input
  return {
    from: blended({color: gradient.from.color, over: under, alpha: gradient.from.opacity}),
    to: blended({color: gradient.to.color, over: under, alpha: gradient.to.opacity}),
  }
}

function pxRow(input: {kind: PaintKind; expected: number | null; found: number; token: string | null}): Compared[] {
  const {kind, expected, found, token} = input
  if (expected === null || Math.abs(expected - found) <= PX) return []
  return [{kind, expected: `${expected}px`, found: `${found}px`, token}]
}

function shownColor(input: {element: LiveComponent; under: string}): string {
  const {styles} = input.element
  return blended({color: opaque(styles.background) ? styles.background : input.under, over: input.under, alpha: 1})
}

function near(input: {a: string; b: string}): boolean {
  return distance(input) <= COLOR_DELTA
}

function opaque(color: string): boolean {
  const parsed = parse(color)
  return parsed !== undefined && (parsed.alpha ?? 1) > 0
}

function blended(input: {color: string; over: string; alpha: number}): string {
  const top = parse(input.color)
  const bottom = parse(input.over)
  if (top === undefined) return input.color
  const alpha = (top.alpha ?? 1) * input.alpha
  if (bottom === undefined || alpha >= 1) return formatHex(top)
  return formatHex(interpolate([bottom, top], 'rgb')(alpha))
}

function firstFamily(family: string): string {
  const [first = ''] = family.split(',')
  return QUOTES.reduce((text, quote) => text.replaceAll(quote, ''), first)
    .trim()
    .toLowerCase()
}

function hundred(weight: number): number {
  return Math.round(weight / WEIGHT_STEP) * WEIGHT_STEP
}

const WHITE = '#ffffff'
