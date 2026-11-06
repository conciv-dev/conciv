import type {Box, DesignNode} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'

export function structured(root: DesignNode): DesignNode {
  if (root.figma === undefined) return root
  const flat = [...walk(root)].map(({node, parent, depth}, index) => flatOf({node, parent, depth, index}))
  const records = briefRecords(flat)
  const implied = records.flatMap((record) => impliedOf(record))
  const gates = new Map(records.map((record) => [record.id, gateOf(record)]))
  const parents = reparented({flat, implied})
  const nodes = new Map([...walk(root)].map(({node}) => [node.id, node]))
  const order = new Map(flat.map((item) => [item.id, item.index]))
  return rebuilt({id: root.id, nodes, implied, parents, order, gates})
}

type Flat = {
  id: string
  type: string
  name: string
  box: Box
  absolute: boolean
  depth: number
  index: number
  within: string | null
  floating: boolean
}

type Part =
  | {tag: 'node'; item: Flat; box: Box}
  | {tag: 'layered'; box: Box; members: Part[]; virtual: boolean}
  | {
      tag: 'arranged'
      box: Box
      direction: 'row' | 'column'
      gap: string
      children: Part[]
      wrapped: boolean
      virtual: boolean
    }
  | {tag: 'single'; part: Part; box: Box}

type BriefRecord = {
  id: string
  kind: string
  name: string
  box: Box
  parent: string | null
  leaf: boolean
  direction?: 'row' | 'column'
  gap?: string
}

type Implied = {id: string; within: string | null; box: Box; record: BriefRecord}

type Brief = {
  page: Flat[]
  root: Flat
  byId: Map<string, Flat>
  decorations: Set<string>
  records: BriefRecord[]
  wrapIds: Map<string, number>
}

const DRAWN = new Set(['RECTANGLE', 'FRAME'])
const ART = new Set(['ELLIPSE', 'BOOLEAN_OPERATION', 'VECTOR'])
const WRAPPER = 'w:'
const LAYER = 'l:'
const OVERLAP_SHARE = 0.25
const SPAN_SHARE = 0.9
const SPLIT_SLACK = 0.15
const NEAR_PX = 3
const UNIFORM_PX = 2
const BETWEEN_PX = 120
const EDGE_PX = 2

function flatOf(input: {node: DesignNode; parent: DesignNode | null; depth: number; index: number}): Flat {
  const {node, parent, depth, index} = input
  return {
    id: node.id,
    type: node.figma?.type ?? node.kind.toUpperCase(),
    name: node.figma?.name ?? '',
    box: node.figma?.box ?? node.box,
    absolute: node.figma?.absolute ?? false,
    depth,
    index,
    within: parent?.id ?? null,
    floating: false,
  }
}

function briefRecords(flat: Flat[]): BriefRecord[] {
  const page = flat.map((item) => ({...item}))
  const root = page.find((item) => item.depth === 0) ?? page[0]
  if (root === undefined) return []
  const byId = new Map(page.map((item) => [item.id, item]))
  hosted(page)
  floated({page, root, byId})
  const brief: Brief = {page, root, byId, decorations: decorated({page, root, byId}), records: [], wrapIds: new Map()}
  emitNode({brief, n: root, parent: null})
  return brief.records
}

function hosted(page: Flat[]): void {
  ;[...new Set(page.map((item) => item.within))].forEach((parentId) => {
    const sibs = page.filter((item) => item.within === parentId)
    sibs.forEach((n) => {
      const hosts = sibs
        .filter((c) => c !== n && DRAWN.has(c.type) && inside({a: n, b: c, by: EDGE_PX}) && area(c) > area(n))
        .toSorted((a, b) => area(a) - area(b))
      const host = hosts[0]
      if (host !== undefined) n.within = host.id
    })
  })
}

function floated(input: {page: Flat[]; root: Flat; byId: Map<string, Flat>}): void {
  const {page, root, byId} = input
  page.forEach((n) => {
    if (!n.absolute || n === root) return
    const first = n.within === null ? undefined : byId.get(n.within)
    if (first === undefined || holdsCentre({anc: first, n})) return
    const anc = climbed({anc: first, n, root, byId})
    if (anc === undefined) return
    n.within = anc.id
    n.floating = true
  })
}

function climbed(input: {anc: Flat | undefined; n: Flat; root: Flat; byId: Map<string, Flat>}): Flat | undefined {
  const {anc, n, root, byId} = input
  if (anc === undefined || holdsCentre({anc, n}) || anc === root) return anc
  return climbed({...input, anc: anc.within === null ? undefined : byId.get(anc.within)})
}

function holdsCentre(input: {anc: Flat; n: Flat}): boolean {
  const {anc, n} = input
  const cx = n.box.x + n.box.w / 2
  const cy = n.box.y + n.box.h / 2
  return cx >= anc.box.x && cx <= anc.box.x + anc.box.w && cy >= anc.box.y && cy <= anc.box.y + anc.box.h
}

function decorated(input: {page: Flat[]; root: Flat; byId: Map<string, Flat>}): Set<string> {
  const {page, root, byId} = input
  const decorations = new Set<string>()
  const hasKids = (n: Flat): boolean => page.some((k) => k.within === n.id)
  page.forEach((n) => {
    if (hasKids(n) || n.type === 'TEXT' || n === root) return
    const parent = n.within === null ? undefined : byId.get(n.within)
    const sibs = page.filter((o) => o.within === n.within && o !== n)
    const touches = sibs.filter(
      (o) => touch({a: o, b: n}) && !inside({a: o, b: n, by: EDGE_PX}) && !inside({a: n, b: o, by: EDGE_PX}),
    )
    const art = ART.has(n.type) || n.type === 'GROUP'
    if (art && parent !== undefined && leaves({n, parent})) decorations.add(n.id)
    if (ART.has(n.type) && touches.some((o) => o.type === 'TEXT' || hasKids(o))) decorations.add(n.id)
    const covers = parent !== undefined && n.box.w >= parent.box.w * SPAN_SHARE && n.box.h >= parent.box.h * SPAN_SHARE
    if (n.absolute && touches.length > 0 && !covers) decorations.add(n.id)
  })
  grown({page, decorations, hasKids})
  return decorations
}

function grown(input: {page: Flat[]; decorations: Set<string>; hasKids: (n: Flat) => boolean}): void {
  const {page, decorations, hasKids} = input
  const added = page.filter((n) => {
    if (decorations.has(n.id) || hasKids(n) || n.type === 'TEXT' || !ART.has(n.type)) return false
    const sibs = page.filter((o) => o.within === n.within && o !== n && decorations.has(o.id))
    if (!sibs.some((o) => touch({a: o, b: n}))) return false
    decorations.add(n.id)
    return true
  })
  if (added.length > 0) grown(input)
}

function leaves(input: {n: Flat; parent: Flat}): boolean {
  const {n, parent} = input
  return (
    n.box.x < parent.box.x - EDGE_PX ||
    n.box.y < parent.box.y - EDGE_PX ||
    n.box.x + n.box.w > parent.box.x + parent.box.w + EDGE_PX ||
    n.box.y + n.box.h > parent.box.y + parent.box.h + EDGE_PX
  )
}

function kidsOf(input: {brief: Brief; id: string}): Flat[] {
  const {brief, id} = input
  return brief.page.filter((n) => n.within === id && (n.box.w > 0 || n.box.h > 0) && !brief.decorations.has(n.id))
}

function spans(input: {brief: Brief; k: Flat; c: Flat}): boolean {
  const {brief, k, c} = input
  return (
    k.type !== 'TEXT' &&
    k.box.w >= c.box.w * SPAN_SHARE &&
    k.box.h >= c.box.h * SPAN_SHARE &&
    kidsOf({brief, id: k.id}).length === 0
  )
}

function emitNode(input: {brief: Brief; n: Flat; parent: string | null}): void {
  const {brief, n, parent} = input
  const kids = kidsOf({brief, id: n.id})
  const floating = kids.filter((k) => k.floating && !spans({brief, k, c: n}))
  const rest = kids.filter((k) => !spans({brief, k, c: n}) && !floating.includes(k))
  brief.records.push({id: n.id, kind: n.type.toLowerCase(), name: n.name, box: n.box, parent, leaf: rest.length === 0})
  if (rest.length > 0) {
    const arranged = arrange(rest.map((item): Part => ({tag: 'node', item, box: item.box})))
    brief.page
      .filter((d) => d.within === n.id && brief.decorations.has(d.id))
      .forEach((d) =>
        brief.records.push({id: d.id, kind: 'decoration', name: d.name, box: d.box, parent: n.id, leaf: true}),
      )
    emitArranged({brief, a: arranged, parent: n.id})
  }
  floating.forEach((f) => emitNode({brief, n: f, parent: n.id}))
}

function emitArranged(input: {brief: Brief; a: Part; parent: string}): void {
  const {brief, a, parent} = input
  listOf(a).forEach((ch) => {
    if ((ch.tag === 'arranged' || ch.tag === 'layered') && ch.virtual) {
      const id = wrapperId({brief, part: ch})
      brief.records.push({
        id,
        kind: 'wrapper',
        name: '',
        box: ch.box,
        parent,
        leaf: false,
        ...(ch.tag === 'arranged' ? {direction: ch.direction, gap: ch.gap} : {}),
      })
      emitArranged({brief, a: ch, parent})
      return
    }
    if (ch.tag === 'layered') {
      brief.records.push({id: `${LAYER}${firstId(ch)}`, kind: 'layered', name: '', box: ch.box, parent, leaf: false})
      const base = ch.members.toSorted((p, q) => area(q) - area(p))[0]
      if (base === undefined) return
      emitPart({brief, part: base, parent})
      ch.members
        .filter((member) => member !== base)
        .toSorted((p, q) => pageIndex(p) - pageIndex(q))
        .forEach((member) => emitPart({brief, part: member, parent}))
      return
    }
    emitPart({brief, part: ch, parent})
  })
}

function emitPart(input: {brief: Brief; part: Part; parent: string}): void {
  const {brief, part, parent} = input
  if (part.tag === 'node') return emitNode({brief, n: part.item, parent})
  emitArranged({brief, a: {tag: 'single', part, box: part.box}, parent})
}

function listOf(a: Part): Part[] {
  if (a.tag === 'single') return [a.part]
  if (a.tag === 'arranged') return a.children
  if (a.tag === 'layered') return a.members
  return []
}

function pageIndex(part: Part): number {
  return part.tag === 'node' ? part.item.index : -1
}

function firstId(part: Part): string {
  if (part.tag === 'node') return part.item.id
  const [first] = listOf(part)
  return first === undefined ? '' : firstId(first)
}

function wrapperId(input: {brief: Brief; part: Part}): string {
  const first = firstId(input.part)
  const count = (input.brief.wrapIds.get(first) ?? 0) + 1
  input.brief.wrapIds.set(first, count)
  return count === 1 ? `${WRAPPER}${first}` : `w${count}:${first}`
}

function arrange(items: Part[]): Part {
  const members = clusters(items)
  const [only] = members
  if (members.length === 1 && only !== undefined)
    return only.tag === 'layered' ? only : {tag: 'single', part: only, box: only.box}
  const gx = maxGap({members, axis: 'x'})
  const gy = maxGap({members, axis: 'y'})
  if (gx === null && gy === null) return {tag: 'layered', box: boxOf(members), members, virtual: false}
  const axis = gy === null ? 'x' : 'y'
  const {parts, gaps} = split({members, axis})
  const children = parts.map((part): Part => {
    const [single] = part
    if (part.length === 1 && single !== undefined) return single
    return virtualOf(arrange(part))
  })
  const grid = gridOf({axis, children, gaps, members})
  if (grid !== null) return grid
  return {
    tag: 'arranged',
    box: boxOf(members),
    direction: axis === 'x' ? 'row' : 'column',
    gap: gapWord({gaps, children}),
    children,
    wrapped: false,
    virtual: false,
  }
}

function virtualOf(part: Part): Part {
  if (part.tag === 'arranged' || part.tag === 'layered') return {...part, virtual: true}
  return part
}

function gridOf(input: {axis: 'x' | 'y'; children: Part[]; gaps: number[]; members: Part[]}): Part | null {
  const {axis, children, gaps, members} = input
  const rows = children.flatMap((child) =>
    child.tag === 'arranged' && child.virtual && child.direction === 'row' ? [child] : [],
  )
  const [first] = rows
  const cell = first?.children[0]
  if (axis !== 'y' || children.length < 2 || rows.length !== children.length || first === undefined) return null
  if (cell === undefined || !near(rows.map((row) => row.children.length))) return null
  if (!rows.every((row) => row.children.every((k) => Math.abs(k.box.w - cell.box.w) <= NEAR_PX))) return null
  return {
    tag: 'arranged',
    box: boxOf(members),
    direction: 'row',
    gap: `${first.gap} between columns and ${gaps[0] ?? 0} between rows`,
    children: rows.flatMap((row) => row.children),
    wrapped: true,
    virtual: false,
  }
}

function gapWord(input: {gaps: number[]; children: Part[]}): string {
  const {gaps, children} = input
  const [first = 0] = gaps
  const uniform = gaps.every((gap) => Math.abs(gap - first) <= UNIFORM_PX)
  const varies = !uniform && gaps.length > 2
  const between = children.length === 2 && first > BETWEEN_PX
  if (between) return 'space between'
  if (uniform)
    return `${first}${first < -UNIFORM_PX ? ' (the later item overlaps the earlier one by that much: a negative margin on it, never a px size)' : ''}`
  if (varies) return 'varies (sub-groups not drawn; group by meaning)'
  const negative = gaps.some((gap) => gap < -UNIFORM_PX)
  return `${gaps.join('/')}${negative ? ' (a negative gap means the later item overlaps the earlier one by that much: a negative margin on it)' : ''}`
}

function clusters(items: Part[]): Part[] {
  const groups = items.reduce<Part[][]>((found, it) => {
    const hit = found.filter((group) => group.some((other) => overlaps({a: other.box, b: it.box})))
    return [...found.filter((group) => !hit.includes(group)), [it, ...hit.flat()]]
  }, [])
  return groups.flatMap((group): Part[] => {
    const [single] = group
    if (group.length === 1 && single !== undefined) return [single]
    return [{tag: 'layered', box: boxOf(group), members: group, virtual: false}]
  })
}

function split(input: {members: Part[]; axis: 'x' | 'y'}): {parts: Part[][]; gaps: number[]} {
  const {members, axis} = input
  const at = (part: Part): number => (axis === 'x' ? part.box.x : part.box.y)
  const size = (part: Part): number => (axis === 'x' ? part.box.w : part.box.h)
  const sorted = members.toSorted((a, b) => at(a) - at(b))
  const [head] = sorted
  if (head === undefined) return {parts: [], gaps: []}
  const done = sorted.slice(1).reduce(
    (state, it) => {
      const slack = Math.min(size(it), size(state.endItem)) * SPLIT_SLACK
      const opens = at(it) - state.end >= -slack
      const parts = opens ? [...state.parts, [it]] : [...state.parts.slice(0, -1), [...(state.parts.at(-1) ?? []), it]]
      const gaps = opens ? [...state.gaps, Math.round(at(it) - state.end)] : state.gaps
      const further = at(it) + size(it) > state.end
      return {
        parts,
        gaps,
        end: further ? at(it) + size(it) : state.end,
        endItem: further ? it : state.endItem,
      }
    },
    {parts: [[head]], gaps: new Array<number>(), end: at(head) + size(head), endItem: head},
  )
  return {parts: done.parts, gaps: done.gaps}
}

function maxGap(input: {members: Part[]; axis: 'x' | 'y'}): number | null {
  const {parts, gaps} = split(input)
  return parts.length > 1 ? Math.max(...gaps) : null
}

function near(values: number[]): boolean {
  return Math.max(...values) - Math.min(...values) <= NEAR_PX
}

function overlaps(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (iw <= 0 || ih <= 0) return false
  return iw * ih >= Math.min(a.w * a.h, b.w * b.h) * OVERLAP_SHARE
}

function boxOf(parts: Part[]): Box {
  const x = Math.min(...parts.map((part) => part.box.x))
  const y = Math.min(...parts.map((part) => part.box.y))
  return {
    x,
    y,
    w: Math.max(...parts.map((part) => part.box.x + part.box.w)) - x,
    h: Math.max(...parts.map((part) => part.box.y + part.box.h)) - y,
  }
}

function touch(input: {a: {box: Box}; b: {box: Box}}): boolean {
  const {a, b} = input
  return (
    a.box.x < b.box.x + b.box.w &&
    b.box.x < a.box.x + a.box.w &&
    a.box.y < b.box.y + b.box.h &&
    b.box.y < a.box.y + a.box.h
  )
}

function inside(input: {a: {box: Box}; b: {box: Box}; by: number}): boolean {
  const {a, b, by} = input
  return (
    a.box.x >= b.box.x - by &&
    a.box.y >= b.box.y - by &&
    a.box.x + a.box.w <= b.box.x + b.box.w + by &&
    a.box.y + a.box.h <= b.box.y + b.box.h + by
  )
}

function area(item: {box: Box}): number {
  return item.box.w * item.box.h
}

function impliedOf(record: BriefRecord): Implied[] {
  if (!record.id.startsWith(WRAPPER) && !record.id.startsWith(LAYER)) return []
  return [{id: record.id, within: record.parent, box: record.box, record}]
}

function gateOf(record: BriefRecord): NonNullable<DesignNode['gate']> {
  return {
    kind: record.kind,
    leaf: record.leaf,
    parent: record.parent,
    ...(record.direction === undefined ? {} : {direction: record.direction}),
  }
}

function reparented(input: {flat: Flat[]; implied: Implied[]}): Map<string, string | null> {
  const {flat, implied} = input
  const parents = new Map<string, string | null>([
    ...flat.map((item): [string, string | null] => [item.id, item.within]),
    ...implied.map((item): [string, string | null] => [item.id, item.within]),
  ])
  ;[...flat, ...implied].forEach((n) => {
    const within = parents.get(n.id) ?? null
    if (within === null) return
    const holders = implied
      .filter(
        (w) =>
          w.id !== n.id &&
          parents.get(w.id) === within &&
          area(w) >= area(n) &&
          inside({a: n, b: w, by: 1}) &&
          area(w) > area(n),
      )
      .toSorted((a, b) => area(a) - area(b))
    const holder = holders[0]
    if (holder !== undefined) parents.set(n.id, holder.id)
  })
  return parents
}

function rebuilt(input: {
  id: string
  nodes: Map<string, DesignNode>
  implied: Implied[]
  parents: Map<string, string | null>
  order: Map<string, number>
  gates: Map<string, NonNullable<DesignNode['gate']>>
}): DesignNode {
  const {id, nodes, implied, parents, gates} = input
  const childIds = [...parents].flatMap(([child, parent]) => (parent === id ? [child] : []))
  const children = childIds
    .map((child) => rebuilt({...input, id: child}))
    .toSorted((a, b) => firstOrder({node: a, order: input.order}) - firstOrder({node: b, order: input.order}))
  const gate = gates.get(id)
  const known = nodes.get(id)
  if (known !== undefined) return {...known, ...(gate === undefined ? {} : {gate}), children}
  const group = implied.find((entry) => entry.id === id)
  return impliedNode({id, box: group?.box ?? {x: 0, y: 0, w: 0, h: 0}, record: group?.record, gate, children})
}

function firstOrder(input: {node: DesignNode; order: Map<string, number>}): number {
  const own = input.order.get(input.node.id)
  if (own !== undefined) return own
  return Math.min(Number.POSITIVE_INFINITY, ...input.node.children.map((child) => firstOrder({...input, node: child})))
}

function impliedNode(input: {
  id: string
  box: Box
  record: BriefRecord | undefined
  gate: NonNullable<DesignNode['gate']> | undefined
  children: DesignNode[]
}): DesignNode {
  const {id, box, record, gate, children} = input
  const direction = record?.direction
  const mode = direction === undefined ? null : direction === 'row' ? 'HORIZONTAL' : 'VERTICAL'
  return {
    id,
    box: {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)},
    hash: '',
    implied: true,
    figma: {
      type: 'GROUP',
      name: id.startsWith(WRAPPER) ? 'implied group' : 'implied layer',
      absolute: false,
      mode,
      box,
      fields: mode === null ? {} : {layout: {mode, gap: record?.gap ?? ''}},
    },
    ...(gate === undefined ? {} : {gate}),
    kind: 'box',
    border: null,
    radius: 0,
    children,
  }
}
