import {groupBy, range} from 'es-toolkit'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, LiveComponent, Raster, TextGroup, TextRun} from '../shared/types.js'
import {trimToInk} from './comparators/paddle.js'
import {glyphCoreColor} from './deltas/colors.js'
import {expand} from './matchers/tile.js'
import {crop, edgeMap, medianColor} from './raster.js'

type Item = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}

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

function overlapping(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const shared =
    span({start: a.x, length: a.w, otherStart: b.x, otherLength: b.w}) *
    span({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h})
  return shared > Math.min(area(a), area(b)) / 2
}

function sameLine(input: {a: Box; b: Box}): boolean {
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

function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

function union(boxes: Box[]): Box {
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

function toGroup(input: {members: Item[]; live: Raster; target: Raster; color: ColorMetric}): TextGroup | null {
  const sorted = input.members.toSorted(readingOrder)
  const liveItems = sorted.filter((item) => item.side === 'live')
  const targetItems = sorted.filter((item) => item.side === 'target')
  const owner = liveItems[0]?.owner ?? null
  if (owner === null || targetItems.length === 0) return null
  const liveBoxes = liveItems.flatMap((item) => item.boxes)
  const targetBoxes = targetItems.flatMap((item) => item.boxes)
  const liveText = joined(liveItems)
  const targetText = joined(targetItems)
  const trimmed = liveBoxes.map((box) => trimToInk({raster: input.live, box}))
  const agrees =
    folded(liveText) === folded(targetText) &&
    inkAgrees({live: input.live, target: input.target, liveBoxes: trimmed, targetBoxes, color: input.color}) &&
    placeAgrees({liveBoxes: trimmed, targetBoxes})
  return {live: liveBoxes, target: targetBoxes, liveText, targetText, agrees, owner}
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
  const groups = connected([...liveItems, ...targetItems]).flatMap(
    (members) => toGroup({members, live, target, color}) ?? [],
  )
  const agreeing = groups.filter((group) => group.agrees).flatMap((group) => [...group.live, ...group.target])
  return {groups, agreeing}
}
