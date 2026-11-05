import {createHash} from 'node:crypto'
import {omit, partition} from 'es-toolkit'
import type {z} from 'zod'
import {toolError} from '@conciv/extension'
import {DESIGN_TOOLS, type Box, type DesignNode, type TargetAdapter} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {box as geometry} from '../../shared/box.js'
import {walk} from '../../shared/tree.js'
import {createRaster} from '../raster.js'
import {createReader} from './read.js'
import {segment} from './segment.js'
import {inferLayout} from './layout.js'
import {assignRoles} from './roles.js'

export function createImageAdapter(input: {config: DesignConfig}): TargetAdapter {
  const {config} = input
  const reader = createReader({config})
  return {
    kind: 'image',
    dispose: () => reader.dispose(),
    accepts: (ref) => !webUrl(ref),
    load: async ({ref, scale, project, files, attachments}) => {
      const read = await readImage({ref, project, files, attachments})
      const raster = createRaster(read.image)
      const text = await guarded({name: 'text', value: [], run: () => reader.read(raster)})
      const segmented = await guarded({
        name: 'segment',
        value: {nodes: text.value, warnings: []},
        run: async () => segment({raster, nodes: text.value, config}),
      })
      const page: DesignNode = {
        id: 'root',
        hash: '',
        box: {x: 0, y: 0, w: raster.width, h: raster.height},
        kind: 'box',
        border: null,
        radius: 0,
        children: nest(segmented.value.nodes.map(designNode)),
      }
      const roled = await guarded({name: 'roles', value: page, run: async () => assignRoles(page)})
      const carved = await guarded({
        name: 'regions',
        value: roled.value,
        run: async () => regions({root: roled.value, scale}),
      })
      return {
        design: {
          id: createHash('sha256').update(read.image).digest('hex').slice(0, 12),
          source: {kind: 'image', ref: read.ref},
          viewport: {width: Math.round(raster.width / scale), height: Math.round(raster.height / scale)},
          scale,
          root: hashed(inferLayout(carved.value)),
        },
        image: read.image,
        warnings: [
          ...text.warnings,
          ...segmented.warnings,
          ...segmented.value.warnings,
          ...roled.warnings,
          ...carved.warnings,
        ],
      }
    },
  }
}

type DesignConfig = z.output<typeof designConfig>
type Tolerances = typeof designConfig.tolerances
type Load = Parameters<TargetAdapter['load']>[0]
type Bare<Node> = Node extends unknown ? Omit<Node, 'id' | 'hash' | 'children' | 'layout'> : never
type Item = Bare<DesignNode>
type BoxNode = Extract<DesignNode, {kind: 'box'}>
type Along = 'x' | 'y'
type Seat = {id: string; region: string | undefined}
type Carved = {node: BoxNode; parent: string | undefined}
type Carving = {seats: Seat[]; regions: Carved[]}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const REGION_DEPTH = 3
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ID_LENGTH = 8

function webUrl(ref: string): boolean {
  if (!URL.canParse(ref)) return false
  const {protocol} = new URL(ref)
  return protocol === 'http:' || protocol === 'https:'
}

async function readImage(
  input: Pick<Load, 'ref' | 'project' | 'files' | 'attachments'>,
): Promise<{image: Uint8Array; ref: string}> {
  const {ref, project, files, attachments} = input
  if (attachments.image !== undefined) return {image: attachments.image, ref}
  const stored: unknown = await (ref.startsWith('/') ? files.getItemRaw(ref.slice(1)) : project.getItemRaw(ref)).catch(
    () => null,
  )
  if (stored instanceof Uint8Array) return {image: new Uint8Array(stored), ref}
  const decoded = new Uint8Array(Buffer.from(ref, 'base64'))
  if (PNG_SIGNATURE.every((byte, index) => decoded[index] === byte)) return {image: decoded, ref: 'base64'}
  throw toolError('image-unreadable', {message: `${UNREADABLE}: ${ref.slice(0, 80)}`})
}

async function guarded<Value>(input: {
  name: string
  value: Value
  run: () => Promise<Value>
}): Promise<{value: Value; warnings: string[]}> {
  return input.run().then(
    (value) => ({value, warnings: []}),
    (error: unknown) => ({
      value: input.value,
      warnings: [`${input.name} failed: ${error instanceof Error ? error.message : String(error)}`],
    }),
  )
}

function designNode(item: Item): DesignNode {
  return {
    ...item,
    id: nodeId({kind: item.kind, box: item.box, text: item.kind === 'text' ? item.text : undefined}),
    hash: '',
    children: [],
  }
}

function nest(nodes: DesignNode[]): DesignNode[] {
  const parents = nodes.map((node) =>
    nodes.reduce<number>((best, other, index) => {
      if (!holds({outer: other, inner: node})) return best
      const current = nodes[best]
      return current === undefined || geometry.area(other.box) < geometry.area(current.box) ? index : best
    }, -1),
  )
  const build = (index: number): DesignNode[] => {
    const node = nodes[index]
    if (node === undefined) return []
    return [{...node, children: parents.flatMap((parent, child) => (parent === index ? build(child) : []))}]
  }
  return parents.flatMap((parent, index) => (parent === -1 ? build(index) : []))
}

function holds(input: {outer: DesignNode; inner: DesignNode}): boolean {
  const {outer, inner} = input
  return (
    outer.kind === 'box' &&
    outer !== inner &&
    geometry.area(outer.box) > geometry.area(inner.box) &&
    geometry.encloses({outer: outer.box, inner: inner.box})
  )
}

function hashed(node: DesignNode): DesignNode {
  const children = node.children.map(hashed)
  const hash = createHash('sha256')
    .update(JSON.stringify(omit(node, ['hash', 'children'])))
    .update(children.map((child) => child.hash).join(''))
    .digest('hex')
  return {...node, hash, children}
}

function regions(input: {root: DesignNode; scale: number}): DesignNode {
  const {scale} = input
  const tolerances = designConfig.tolerances
  const root = withoutTwins({node: input.root, tolerances})
  const [pictures, members] = partition(root.children, (node) => node.kind === 'image')
  const {seats, regions: carved} = carve({members, parent: undefined, along: 'y', depth: 1, scale, tolerances})
  const placed = pictures.map((shown) => ({id: shown.id, region: holder({box: shown.box, regions: carved})}))
  const holding = new Set(placed.map((seat) => seat.region))
  const known = new Set([...walk(root)].map(({node}) => node.id))
  const flanked = carved
    .filter((region) => holding.has(region.node.id))
    .reduce<Carving>(
      (carving, region) => beside({carving, region, nodes: root.children, known, gap: tolerances.regionGap * scale}),
      {seats: [...seats, ...placed], regions: carved},
    )
  const carving = {seats: flanked.seats, regions: grown({carving: flanked, nodes: root.children})}
  return {...root, children: regrouped({nodes: root.children, carving, parent: undefined})}
}

function regrouped(input: {nodes: DesignNode[]; carving: Carving; parent: string | undefined}): DesignNode[] {
  const {nodes, carving, parent} = input
  const regionOf = (id: string): string | undefined => carving.seats.find((seat) => seat.id === id)?.region
  return [
    ...nodes.filter((node) => regionOf(node.id) === parent),
    ...carving.regions
      .filter((region) => region.parent === parent)
      .map((region) => ({...region.node, children: regrouped({...input, parent: region.node.id})})),
  ]
}

function withoutTwins(input: {node: DesignNode; tolerances: Tolerances}): DesignNode {
  const {node, tolerances} = input
  const kept = node.children.reduce<DesignNode[]>((found, child) => {
    const twin = found.find((other) => twins({a: other, b: child, tolerances}))
    if (twin === undefined) return [...found, child]
    return found.map((other) => (other === twin ? {...other, children: [...other.children, ...child.children]} : other))
  }, [])
  return {...node, children: kept.map((child) => withoutTwins({node: child, tolerances}))}
}

function twins(input: {a: DesignNode; b: DesignNode; tolerances: Tolerances}): boolean {
  const {a, b, tolerances} = input
  if (a.kind !== b.kind) return false
  if (a.kind === 'text' && b.kind === 'text' && a.text.trim() !== b.text.trim()) return false
  const near = (edge: (box: Box) => number): boolean => Math.abs(edge(a.box) - edge(b.box)) <= tolerances.geometryPx
  return [(box: Box) => box.x, (box: Box) => box.y, (box: Box) => box.x + box.w, (box: Box) => box.y + box.h].every(
    near,
  )
}

function carve(input: {
  members: DesignNode[]
  parent: string | undefined
  along: Along
  depth: number
  scale: number
  tolerances: Tolerances
}): Carving {
  const {members, parent, along, depth, scale, tolerances} = input
  const gap = (parent === undefined ? tolerances.sectionGap : tolerances.regionGap) * scale
  const seated: Carving = {seats: members.map((node) => ({id: node.id, region: parent})), regions: []}
  if (depth > REGION_DEPTH || members.length < 2) return seated
  const groups = absorbed({groups: bands({members, along, gap}), along})
  const next: Along = along === 'y' ? 'x' : 'y'
  if (groups.length < 2) return carve({...input, along: next, depth: depth + 1})
  const carvings = groups.map((group): Carving => {
    if (group.length < 2) return {seats: group.map((node) => ({id: node.id, region: parent})), regions: []}
    const region = regionNode({members: group, parent})
    const inner = carve({...input, members: group, parent: region.node.id, along: next, depth: depth + 1})
    return {seats: inner.seats, regions: [region, ...inner.regions]}
  })
  return {
    seats: carvings.flatMap((carving) => carving.seats),
    regions: carvings.flatMap((carving) => carving.regions),
  }
}

function beside(input: {
  carving: Carving
  region: Carved
  nodes: DesignNode[]
  known: Set<string>
  gap: number
}): Carving {
  const {carving, region} = input
  const id = region.node.id
  const seated = new Set(carving.seats.filter((seat) => seat.region === id).map((seat) => seat.id))
  const direct = [
    ...input.nodes.filter((node) => seated.has(node.id)),
    ...carving.regions.filter((child) => child.parent === id).map((child) => child.node),
  ]
  const groups = bands({members: direct, along: 'x', gap: input.gap})
  if (groups.length < 2) return carving
  const known = new Set([...input.known, ...carving.regions.map((child) => child.node.id)])
  const wraps = groups
    .filter((group) => group.length > 1)
    .map((group) => {
      const wrap = regionNode({members: group, parent: id})
      return {group, wrap: {...wrap, node: {...wrap.node, id: nodeId({kind: 'box', box: wrap.node.box, text: id})}}}
    })
    .filter(({wrap}) => !known.has(wrap.node.id))
  const movedTo = (child: string): string | undefined =>
    wraps.find(({group}) => group.some((node) => node.id === child))?.wrap.node.id
  return {
    seats: carving.seats.map((seat) => ({id: seat.id, region: movedTo(seat.id) ?? seat.region})),
    regions: [
      ...carving.regions.map((child) => ({...child, parent: movedTo(child.node.id) ?? child.parent})),
      ...wraps.map(({wrap}) => wrap),
    ],
  }
}

function grown(input: {carving: Carving; nodes: DesignNode[]}): Carved[] {
  const {carving, nodes} = input
  const span = (visit: {region: Carved; seen: Set<string>}): Box => {
    const {region} = visit
    const seen = new Set([...visit.seen, region.node.id])
    return geometry.union([
      region.node.box,
      ...carving.seats.flatMap((seat) => {
        const node = seat.region === region.node.id ? nodes.find((member) => member.id === seat.id) : undefined
        return node === undefined ? [] : [node.box]
      }),
      ...carving.regions
        .filter((child) => child.parent === region.node.id && !seen.has(child.node.id))
        .map((child) => span({region: child, seen})),
    ])
  }
  return carving.regions.map((region) => ({...region, node: {...region.node, box: span({region, seen: new Set()})}}))
}

function bandStart(input: {box: Box; along: Along}): number {
  return input.along === 'y' ? input.box.y : input.box.x
}

function bandEnd(input: {box: Box; along: Along}): number {
  return input.along === 'y' ? input.box.y + input.box.h : input.box.x + input.box.w
}

function bands(input: {members: DesignNode[]; along: Along; gap: number}): DesignNode[][] {
  const {along, gap} = input
  return input.members
    .toSorted((a, b) => bandStart({box: a.box, along}) - bandStart({box: b.box, along}))
    .reduce<{groups: DesignNode[][]; end: number}>(
      (sweep, node) => {
        const last = sweep.groups.at(-1)
        if (last === undefined || bandStart({box: node.box, along}) - sweep.end >= gap) {
          return {groups: [...sweep.groups, [node]], end: bandEnd({box: node.box, along})}
        }
        last.push(node)
        return {groups: sweep.groups, end: Math.max(sweep.end, bandEnd({box: node.box, along}))}
      },
      {groups: [], end: 0},
    ).groups
}

function absorbed(input: {groups: DesignNode[][]; along: Along}): DesignNode[][] {
  const {groups, along} = input
  const index = groups.findIndex((group) => group.length === 1 && group[0]?.kind !== 'box')
  const lone = groups[index]
  if (groups.length < 2 || lone === undefined) return groups
  const span = geometry.union(lone.map((node) => node.box))
  const before = groups[index - 1]
  const after = groups[index + 1]
  const gapBefore =
    before === undefined
      ? Infinity
      : bandStart({box: span, along}) - bandEnd({box: geometry.union(before.map((node) => node.box)), along})
  const gapAfter =
    after === undefined
      ? Infinity
      : bandStart({box: geometry.union(after.map((node) => node.box)), along}) - bandEnd({box: span, along})
  const into = gapBefore <= gapAfter ? index - 1 : index + 1
  const merged = groups.flatMap((group, position) => {
    if (position === index) return []
    if (position === into) return [[...group, ...lone]]
    return [group]
  })
  return absorbed({groups: merged, along})
}

function holder(input: {box: Box; regions: Carved[]}): string | undefined {
  const [best] = input.regions
    .map(({node: region}) => {
      const shared = geometry.intersection({a: input.box, b: region.box})
      return {
        region,
        area: shared === null ? 0 : geometry.area(shared),
        distance: edgeDistance({a: input.box, b: region.box}),
      }
    })
    .toSorted(
      (a, b) => b.area - a.area || a.distance - b.distance || geometry.area(a.region.box) - geometry.area(b.region.box),
    )
  return best?.region.id
}

function edgeDistance(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const across = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const down = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.hypot(across, down)
}

function regionNode(input: {members: DesignNode[]; parent: string | undefined}): Carved {
  const box = geometry.union(input.members.map((node) => node.box))
  return {
    node: {id: nodeId({kind: 'box', box}), hash: '', kind: 'box', box, border: null, radius: 0, children: []},
    parent: input.parent,
  }
}

function nodeId(input: {kind: DesignNode['kind']; box: Box; text?: string}): string {
  const {kind, box} = input
  const rounded = [box.x, box.y, box.w, box.h].map(Math.round).join(',')
  const hash = [...`${kind}|${rounded}|${input.text ?? ''}`].reduce(
    (running, character) => Math.imul(running ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )
  return hash.toString(16).padStart(ID_LENGTH, '0')
}

const [targetDef] = DESIGN_TOOLS

const UNREADABLE = targetDef.errors?.['image-unreadable'].message ?? ''
