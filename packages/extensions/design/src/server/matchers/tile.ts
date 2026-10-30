import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, Comparators, LiveComponent, Matcher, Pair, Raster} from '../../shared/types.js'
import {DECLARED_COLOR_DELTA_E, isOpaqueHex, sampledFills} from '../deltas/colors.js'
import {boxBlur, crop} from '../raster.js'

export function expand(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2}
}

function clip(input: {box: Box; to: Box}): Box {
  const {box, to} = input
  const x = Math.max(box.x, to.x)
  const y = Math.max(box.y, to.y)
  return {x, y, w: Math.min(box.x + box.w, to.x + to.w) - x, h: Math.min(box.y + box.h, to.y + to.h) - y}
}

function shift(input: {box: Box; by: Box}): Box {
  return {...input.box, x: input.box.x + input.by.x, y: input.box.y + input.by.y}
}

function sameGeometry(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

export function componentSelector(input: {component: LiveComponent; parent: Pair | null}): string {
  const {component, parent} = input
  const {source, tag} = component
  if (source !== null) return `[data-conciv-source="${source.file}:${source.line}:${source.column}"]`
  return parent === null ? tag : `${parent.selector} > ${tag}`
}

type Pages = {live: Raster; target: Raster; blurredLive: Raster; blurredTarget: Raster; page: Box}

function tileMismatch(input: {pages: Pages; box: Box; comparators: Comparators}): number {
  const {pages, box, comparators} = input
  const tile = expand({box, by: TOLERANCES.tileMargin})
  const a = crop({raster: pages.blurredLive, box: tile}).raster
  const b = crop({raster: pages.blurredTarget, box: tile}).raster
  return comparators.pixel.compare({a, b}).mismatch
}

function estimateTarget(input: {pages: Pages; box: Box; parent: Pair | null; comparators: Comparators}): Box | null {
  const {pages, box, parent, comparators} = input
  const window = parent?.targetBox ? expand({box: parent.targetBox, by: TOLERANCES.tileMargin}) : pages.page
  const target = crop({raster: pages.target, box: window})
  const live = crop({raster: pages.live, box: window})
  const origin = target.box
  const {targetBox} = comparators.geometry.estimate({
    live: live.raster,
    target: target.raster,
    liveBox: {...box, x: box.x - origin.x, y: box.y - origin.y},
  })
  return targetBox === null ? null : shift({box: targetBox, by: origin})
}

function colorAgrees(input: {pages: Pages; pair: Pair; comparators: Comparators}): boolean {
  const {pages, pair, comparators} = input
  const declared = pair.live.styles.background
  if (pair.targetBox === null || !isOpaqueHex(declared)) return true
  const sampled = sampledFills({raster: pages.target, box: pair.targetBox}).background
  return comparators.color.distance({a: declared, b: sampled}) <= DECLARED_COLOR_DELTA_E
}

function matchPairs(input: {
  components: LiveComponent[]
  parent: Pair | null
  depth: number
  maxDepth: number
  pages: Pages
  comparators: Comparators
}): Pair[] {
  const {components, parent, depth, maxDepth, pages, comparators} = input
  const siblings = components.flatMap((component): Pair[] => {
    const liveBox = clip({box: component.box, to: pages.page})
    if (liveBox.w <= 0 || liveBox.h <= 0) return []
    const mismatch = tileMismatch({pages, box: liveBox, comparators})
    const equal = mismatch < TOLERANCES.tileGate
    return [
      {
        live: component,
        selector: componentSelector({component, parent}),
        liveBox,
        targetBox: equal ? liveBox : estimateTarget({pages, box: liveBox, parent, comparators}),
        mismatch,
        depth,
        parent,
        prev: null,
        next: null,
      },
    ]
  })
  siblings.forEach((pair, index) => {
    pair.prev = siblings[index - 1] ?? null
    pair.next = siblings[index + 1] ?? null
  })
  return siblings.flatMap((pair) => {
    const descend =
      depth < maxDepth &&
      pair.mismatch >= TOLERANCES.tileGate &&
      pair.targetBox !== null &&
      sameGeometry({a: pair.liveBox, b: pair.targetBox}) &&
      colorAgrees({pages, pair, comparators})
    if (!descend) return [pair]
    return [
      pair,
      ...matchPairs({components: pair.live.children, parent: pair, depth: depth + 1, maxDepth, pages, comparators}),
    ]
  })
}

export const tileMatcher: Matcher = {
  name: 'tile',
  match: ({live, target, comparators, depth}) => {
    const page: Box = {
      x: 0,
      y: 0,
      w: Math.min(live.raster.width, target.raster.width),
      h: Math.min(live.raster.height, target.raster.height),
    }
    const liveRaster = crop({raster: live.raster, box: page}).raster
    const targetRaster = crop({raster: target.raster, box: page}).raster
    const pages: Pages = {
      live: liveRaster,
      target: targetRaster,
      blurredLive: boxBlur({raster: liveRaster, radius: TOLERANCES.blurRadius}),
      blurredTarget: boxBlur({raster: targetRaster, radius: TOLERANCES.blurRadius}),
      page,
    }
    const whole = comparators.pixel.compare({a: pages.blurredLive, b: pages.blurredTarget})
    const pairs = matchPairs({components: live.components, parent: null, depth: 1, maxDepth: depth, pages, comparators})
    return {
      mismatch: whole.mismatch,
      mask: whole.mask,
      pairs,
      matchedTargetBoxes: pairs.flatMap((pair) => pair.targetBox ?? []),
    }
  },
}
