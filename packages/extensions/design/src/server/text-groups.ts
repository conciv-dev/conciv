import {groupBy, range} from 'es-toolkit'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, LiveComponent, Raster, TextGroup, TextRun} from '../shared/types.js'
import {glyphCoreColor} from './deltas/colors.js'
import {crop, edgeMap, expand, medianColor, trimToInk} from './raster.js'

type Item = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}
type Grouped = {group: TextGroup; mask: Box[]}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

function area(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}

function span(input: {start: number; length: number; otherStart: number; otherLength: number}): number {
  const {start, length, otherStart, otherLength} = input
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart))
}

export function overlapping(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const shared =
    span({start: a.x, length: a.w, otherStart: b.x, otherLength: b.w}) *
    span({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h})
  return shared > Math.min(area(a), area(b)) / 2
}

export function sameLine(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return span({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h}) >= Math.min(a.h, b.h) / 2
}

function readingOrder(a: Item, b: Item): number {
  const first = a.boxes[0]
  const second = b.boxes[0]
  if (first === undefined || second === undefined) return 0
  if (sameLine({a: first, b: second})) return first.x - second.x
  return first.y - second.y
}

function joined(items: Item[]): string {
  return items
    .map((item) => item.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

export function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  }
}

function inkColor(input: {raster: Raster; boxes: Box[]; color: ColorMetric}): string | null {
  const {raster, boxes, color} = input
  const box = expand({box: union(boxes), by: TOLERANCES.tileMargin})
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return glyphCoreColor({raster, box, glyphs: boxes, background, color})
}

function inkAgrees(input: {
  live: Raster
  target: Raster
  liveBoxes: Box[]
  targetBoxes: Box[]
  color: ColorMetric
}): boolean {
  const {color} = input
  const a = inkColor({raster: input.live, boxes: input.liveBoxes, color})
  const b = inkColor({raster: input.target, boxes: input.targetBoxes, color})
  return a !== null && b !== null && color.distance({a, b}) <= TOLERANCES.colorDeltaE
}

function placeAgrees(input: {liveBoxes: Box[]; targetBoxes: Box[]}): boolean {
  const a = union(input.liveBoxes)
  const b = union(input.targetBoxes)
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function words(text: string): string[] {
  return [...text]
    .map((character) => (character.trim() === '' ? ' ' : character))
    .join('')
    .split(' ')
    .filter((word) => word !== '')
}

function foundAt(input: {wanted: string[]; among: string[]; from: number}): number | undefined {
  const {wanted, from} = input
  const folds = input.among.map((word) => word.toLowerCase())
  return range(from, Math.max(from, folds.length - wanted.length + 1)).find((start) =>
    wanted.every((word, offset) => folds[start + offset] === word.toLowerCase()),
  )
}

function misaligned(input: {liveItems: Item[]; targetText: string}): {item: Item; remainder: string} | null {
  const target = words(input.targetText)
  const walk = input.liveItems.reduce<{cursor: number; missing: Item | null}>(
    (state, item) => {
      if (state.missing !== null) return state
      const wanted = words(item.text)
      const at = foundAt({wanted, among: target, from: state.cursor})
      return at === undefined ? {cursor: state.cursor, missing: item} : {cursor: at + wanted.length, missing: null}
    },
    {cursor: 0, missing: null},
  )
  if (walk.missing === null) return null
  return {item: walk.missing, remainder: target.slice(walk.cursor).join(' ')}
}

type Constituent = {item: Item; trimmed: Box[]; agrees: boolean}

function constituent(input: {item: Item; live: Raster; target: Raster; color: ColorMetric}): Constituent {
  const {item, live, target, color} = input
  const trimmed = item.boxes.map((box) => trimToInk({raster: live, box}))
  const agrees = inkAgrees({live, target, liveBoxes: trimmed, targetBoxes: item.boxes, color})
  return {item, trimmed, agrees}
}

function masked(input: {constituent: Constituent; targetBoxes: Box[]}): Box[] {
  const {constituent: part, targetBoxes} = input
  const reach = part.trimmed.map((box) => expand({box, by: TOLERANCES.geometryPx}))
  const target = targetBoxes.flatMap((a) => reach.flatMap((b) => intersection({a, b}) ?? []))
  return [...part.trimmed, ...target]
}

function connected(items: Item[]): Item[][] {
  const parent = items.map((_, index) => index)
  const root = (index: number): number => {
    const above = parent[index] ?? index
    if (above === index) return index
    const top = root(above)
    parent[index] = top
    return top
  }
  items.forEach((item, index) => {
    range(index + 1, items.length).forEach((next) => {
      const touching = item.boxes.some((a) => items[next]?.boxes.some((b) => overlapping({a, b})) === true)
      if (touching) parent[root(next)] = root(index)
    })
  })
  const byRoot = groupBy(range(items.length), (index) => String(root(index)))
  return Object.values(byRoot).map((indexes) => indexes.flatMap((index) => items[index] ?? []))
}

function agreement(input: {parts: Constituent[]; targetBoxes: Box[]; sameText: boolean}): {
  agrees: boolean
  mask: Box[]
} {
  const {parts, targetBoxes, sameText} = input
  const samePlace = placeAgrees({liveBoxes: parts.flatMap((part) => part.trimmed), targetBoxes})
  if (!sameText || !samePlace) return {agrees: false, mask: []}
  const agreeing = parts.filter((part) => part.agrees)
  return {
    agrees: agreeing.length === parts.length,
    mask: agreeing.flatMap((part) => masked({constituent: part, targetBoxes})),
  }
}

function attributed(input: {group: TextGroup; liveItems: Item[]; sameText: boolean}): TextGroup {
  const {group, liveItems, sameText} = input
  const missing = sameText ? null : misaligned({liveItems, targetText: group.targetText})
  if (missing === null || missing.item.owner === null) return group
  return {...group, liveText: missing.item.text.trim(), targetText: missing.remainder, owner: missing.item.owner}
}

function toGroup(input: {members: Item[]; live: Raster; target: Raster; color: ColorMetric}): Grouped | null {
  const {live, target, color} = input
  const sorted = input.members.toSorted(readingOrder)
  const liveItems = sorted.filter((item) => item.side === 'live')
  const targetItems = sorted.filter((item) => item.side === 'target')
  const owner = liveItems[0]?.owner ?? null
  if (owner === null || targetItems.length === 0) return null
  const targetBoxes = targetItems.flatMap((item) => item.boxes)
  const liveText = joined(liveItems)
  const targetText = joined(targetItems)
  const sameText = folded(liveText) === folded(targetText)
  const parts = liveItems.map((item) => constituent({item, live, target, color}))
  const {agrees, mask} = agreement({parts, targetBoxes, sameText})
  const liveBoxes = liveItems.flatMap((item) => item.boxes)
  const group = {live: liveBoxes, target: targetBoxes, liveText, targetText, agrees, owner}
  return {group: attributed({group, liveItems, sameText}), mask}
}

export function textDiffers(group: TextGroup): boolean {
  return folded(group.liveText) !== folded(group.targetText)
}

export function groupText(input: {
  components: LiveComponent[]
  runs: TextRun[]
  live: Raster
  target: Raster
  color: ColorMetric
}): {groups: TextGroup[]; agreeing: Box[]} {
  const {components, runs, live, target, color} = input
  if (runs.length === 0) return {groups: [], agreeing: []}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): Item => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): Item => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const grouped = connected([...liveItems, ...targetItems]).flatMap(
    (members) => toGroup({members, live, target, color}) ?? [],
  )
  return {groups: grouped.map(({group}) => group), agreeing: grouped.flatMap(({mask}) => mask)}
}
