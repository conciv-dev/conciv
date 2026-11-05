import type {Box, Delta, LiveComponent, Match, Run} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {box} from '../shared/box.js'

export function itemsOf(input: {root: Match; extras: LiveComponent[]; distance: Distance}): {
  items: Item[]
  unbuilt: Unbuilt
  tiles: Box[]
  explained: Box[]
} {
  const {root, distance} = input
  const visits = [...walk(root)].flatMap(({node, parent, depth}) =>
    parent === null ? [] : [{match: node, parent, depth}],
  )
  const unbuilt: Unbuilt = new Map(
    visits.flatMap(({match, parent}) =>
      match.live === null
        ? [[match.node.id, {stage: structural({match, parent, root}) ? 'structure' : null}] as const]
        : [],
    ),
  )
  const deltas = visits.flatMap(({match, depth}) =>
    match.live === null ? [] : scored(match).map((delta) => deltaItem({match, delta, depth, distance})),
  )
  const slots = new Set(visits.flatMap(({match}) => (iconSlot(match) ? [match.node.id] : [])))
  const runs = [...walk(root)].flatMap(({node}) =>
    (node.node.layout?.runs ?? [])
      .filter((run) => run.children.every((id) => unbuilt.get(id)?.stage === 'structure'))
      .map((run) => ({run, owner: node})),
  )
  const complete = visits.filter(
    ({match}) =>
      unbuilt.has(match.node.id) &&
      allUnbuilt({match, unbuilt}) &&
      match.children.some((child) => !slots.has(child.node.id)),
  )
  const covered = new Set([
    ...runs.flatMap(({run}) => run.children),
    ...complete.flatMap(({match}) => [...walk(match)].flatMap(({node, depth}) => (depth === 0 ? [] : [node.node.id]))),
  ])
  const built = visits.flatMap(({match}) => {
    const entry = unbuilt.get(match.node.id)
    if (entry === undefined || slots.has(match.node.id) || covered.has(match.node.id)) return []
    return [unbuiltItem({match, stage: entry.stage})]
  })
  const paired = visits.flatMap(({match}) => (match.live === null ? [] : [{match, live: match.live}]))
  const extras = extraItems({
    components: input.extras,
    paths: new Set(paired.map(({live}) => live.path)),
    cards: paired.map(({match}) => match.node.box),
  })
  const grouped = runs.map(({run, owner}) => runItem({run, owner}))
  const offsets = [...walk(root)].flatMap(({node, depth}) => offsetItem({match: node, page: depth === 0}))
  const items = [...deltas, ...built, ...extras, ...offsets, ...grouped]
  return {
    items,
    unbuilt,
    tiles: paired.flatMap(({match, live}) =>
      scored(match).length === 0 && match.deltas.some(residual) ? [live.box] : [],
    ),
    explained: [
      ...paired.flatMap(({match, live}) => (scored(match).length > 0 ? [live.box] : [])),
      ...items.filter((item) => item.kind === 'unbuilt' || item.kind === 'extra').map((item) => item.box),
    ],
  }
}

type Item = Run['items'][number]

type Stage = NonNullable<Run['stage']>

type Distance = (input: {a: string; b: string}) => number

const TOLERANCES = designConfig.tolerances

function offsetItem(input: {match: Match; page: boolean}): Item[] {
  const {match, page} = input
  const {shift, live} = match
  if (shift === null) return []
  const dx = Math.round(shift.x)
  const dy = Math.round(shift.y)
  const base = {
    kind: 'offset' as const,
    stage: 'geometry' as const,
    size: capped(Math.max(Math.abs(dx), Math.abs(dy)) / TOLERANCES.geometryPx),
    confidence: 1,
    depth: 0,
    value: `${dx},${dy}`,
    sentence: '',
  }
  if (page) return [{...base, key: `offset:${boxKey(NO_BOX)}`, box: NO_BOX}]
  if (live === null || scored(match).some((delta) => GEOMETRY_KINDS.includes(delta.kind))) return []
  return [
    {
      ...base,
      key: `offset:${match.node.id}`,
      box: live.box,
      node: match.node.id,
      ...(live.source === null ? {} : {source: live.source}),
    },
  ]
}

function scored(match: Match): Delta[] {
  return match.deltas.filter((delta) => delta.warning === undefined && !residual(delta))
}

function residual(delta: Delta): boolean {
  return delta.kind === 'pixels' && typeof delta.live === 'number' && delta.live < TOLERANCES.pixelGate
}

function structural(input: {match: Match; parent: Match; root: Match}): boolean {
  const {match, parent, root} = input
  return match.node.kind !== 'image' && !glyphRun(match.node) && (parent === root || parent.live !== null)
}

function glyphRun(node: Match['node']): boolean {
  if (node.kind !== 'text') return false
  return designConfig.folded(node.text).length === 1 && node.box.h < GLYPH_RUN_HEIGHT
}

function iconSlot(match: Match): boolean {
  return match.node.kind === 'image' && designConfig.iconSized(match.node.box)
}

function allUnbuilt(input: {match: Match; unbuilt: Unbuilt}): boolean {
  const {children} = input.match
  return children.length > 0 && children.every((child) => input.unbuilt.has(child.node.id))
}

function deltaItem(input: {match: Match; delta: Delta; depth: number; distance: Distance}): Item {
  const {match, delta, depth, distance} = input
  const source = match.live?.source ?? null
  return {
    key: `${match.node.id}:${delta.kind}${delta.side === undefined ? '' : `:${delta.side}`}`,
    kind: delta.kind,
    stage: designConfig.kindStage(delta.kind),
    size: deltaSize({delta, distance}),
    confidence: delta.confidence ?? 1,
    box: match.live?.box ?? match.node.box,
    depth,
    value: delta.live,
    sentence: '',
    node: match.node.id,
    ...(source === null ? {} : {source}),
  }
}

function unbuiltItem(input: {match: Match; stage: Stage | null}): Item {
  const {match, stage} = input
  const target = match.node.box
  return {
    key: `unbuilt:${match.node.id}`,
    kind: 'unbuilt',
    stage,
    size: areaSize(target),
    confidence: 1,
    box: target,
    depth: 0,
    value: boxKey(target),
    sentence: '',
    node: match.node.id,
  }
}

function runItem(input: {run: LayoutRun; owner: Match}): Item {
  const {run, owner} = input
  const members = run.children.flatMap((id) => owner.children.filter((child) => child.node.id === id))
  const boxes = members.map((member) => member.node.box)
  const area = boxes.length === 0 ? NO_BOX : box.union(boxes)
  const [first] = members
  return {
    key: `unbuilt:${run.children.join('+')}`,
    kind: 'unbuilt',
    stage: 'structure',
    size: boxes.reduce((total, entry) => total + areaSize(entry), 0),
    confidence: 1,
    box: area,
    depth: 0,
    value: boxKey(area),
    sentence: '',
    ...(first === undefined ? {} : {node: first.node.id}),
  }
}

function extraItems(input: {components: LiveComponent[]; paths: Set<string>; cards: Box[]}): Item[] {
  const {paths, cards} = input
  const listed = [...paths]
  return input.components.flatMap((component): Item[] => {
    const holds = paths.has(component.path) || listed.some((path) => path.startsWith(`${component.path}/`))
    const carded = cards.some((card) => box.encloses({inner: component.box, outer: card}))
    if (!holds && designConfig.iconSized(component.box) && carded) return []
    if (!holds && paints(component) && large(component.box)) return [extraItem(component)]
    return extraItems({components: component.children, paths, cards})
  })
}

function extraItem(component: LiveComponent): Item {
  return {
    key: `extra:${boxKey(component.box)}`,
    kind: 'extra',
    stage: null,
    size: areaSize(component.box),
    confidence: 1,
    box: component.box,
    depth: 0,
    value: boxKey(component.box),
    sentence: '',
    ...(component.source === null ? {} : {source: component.source}),
  }
}

function paints(component: LiveComponent): boolean {
  const {background, border} = component.styles
  return component.glyphs.length > 0 || opaqueHex(background) || border.width > 0
}

function opaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

function large(area: Box): boolean {
  return area.w >= TOLERANCES.unmatchedMinimum && area.h >= TOLERANCES.unmatchedMinimum
}

function deltaSize(input: {delta: Delta; distance: Distance}): number {
  const {delta, distance} = input
  const {live, target} = delta
  const gradient = [live, target].some((paint) => typeof paint === 'string' && paint.startsWith(GRADIENT_WORD))
  if (delta.kind === 'background' && gradient && typeof live === 'string' && typeof target === 'string') {
    return capped(gradientDistance({live, target, distance}) / TOLERANCES.colorDeltaE)
  }
  if (COLOR_KINDS.includes(delta.kind) && typeof live === 'string' && typeof target === 'string') {
    return capped(distance({a: live, b: target}) / TOLERANCES.colorDeltaE)
  }
  if (typeof live !== 'number' || typeof target !== 'number') return SIZE_CAP
  const span = delta.kind === 'lines' ? (delta.lineHeight ?? 1) : 1
  return capped((Math.abs(live - target) * span) / designConfig.kindTolerance(delta.kind))
}

function gradientDistance(input: {live: string; target: string; distance: Distance}): number {
  const shown = paintEnds(input.live)
  const design = paintEnds(input.target)
  const pairs =
    shown.length === design.length
      ? shown.flatMap((a, index) => {
          const b = design[index]
          return b === undefined ? [] : [{a, b}]
        })
      : shown.flatMap((a) => design.map((b) => ({a, b})))
  return Math.max(...pairs.map((pair) => input.distance(pair)))
}

function paintEnds(paint: string): string[] {
  if (!paint.startsWith(GRADIENT_WORD)) return [paint]
  const [, from = paint, , to = paint] = paint.split(' ')
  return [from, to]
}

function boxKey(area: Box): string {
  return `${Math.round(area.x)},${Math.round(area.y)},${Math.round(area.w)},${Math.round(area.h)}`
}

function areaSize(area: Box): number {
  return capped((area.w * area.h) / (TOLERANCES.unmatchedMinimum * TOLERANCES.unmatchedMinimum))
}

function capped(value: number): number {
  return Math.min(SIZE_CAP, value)
}

const NO_BOX: Box = {x: 0, y: 0, w: 0, h: 0}

const SIZE_CAP = 10

const GLYPH_RUN_HEIGHT = 14

const OPAQUE_HEX_LENGTH = 7

const GRADIENT_WORD = 'gradient '

const GEOMETRY_KINDS: Delta['kind'][] = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'padding',
  'align',
]

const COLOR_KINDS: Delta['kind'][] = ['background', 'foreground', 'border']

type Unbuilt = Map<string, {stage: Stage | null}>

type LayoutRun = NonNullable<NonNullable<Match['node']['layout']>['runs']>[number]
