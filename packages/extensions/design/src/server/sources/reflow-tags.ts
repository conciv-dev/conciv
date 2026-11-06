import type {Box, DesignNode} from '../../shared/defs.js'

export function reflowTagged(root: DesignNode): DesignNode {
  if (root.figma === undefined) return root
  return tagged(root)
}

type Reflow = NonNullable<DesignNode['reflow']>

const WIDE_PX = 700
const ROW_SHARE = 0.8
const ROW_KIDS = 4
const SCROLL_ROWS = 3
const EDGE_PX = 2
const WRAP_COUNT = 3
const WRAP_NARROWEST = 200
const STACK_NARROWEST = 240
const STACK_SUM = 768
const MIN_SHARE = 0.7

function tagged(node: DesignNode): DesignNode {
  const children = node.children.map(tagged)
  const reflow = reflowOf(node)
  return {...node, children, ...(reflow === null ? {} : {reflow})}
}

function reflowOf(node: DesignNode): Reflow | null {
  const ks = kids(node)
  if (ks.length < 2) return null
  if (scrolls({node, ks})) return {kind: 'scroll'}
  if (!isRow({node, ks})) return null
  const narrowest = Math.min(...ks.map((k) => boxOf(k).w))
  const sum = ks.reduce((total, k) => total + boxOf(k).w, 0)
  const minChildWidth = Math.round(narrowest * MIN_SHARE)
  if (sameComponent(ks) || (sameWidth(ks) && narrowest >= WRAP_NARROWEST)) return {kind: 'wrap', minChildWidth}
  if (narrowest >= STACK_NARROWEST && sum > STACK_SUM && boxOf(node).w > WIDE_PX) return {kind: 'stack', minChildWidth}
  return null
}

function scrolls(input: {node: DesignNode; ks: DesignNode[]}): boolean {
  const {node, ks} = input
  if (ks.length < SCROLL_ROWS || boxOf(node).w <= WIDE_PX) return false
  const rowKids = ks.filter((k) => {
    const rows = kids(k)
    return rows.length >= ROW_KIDS && isRow({node: k, ks: rows}) && boxOf(k).w >= boxOf(node).w * ROW_SHARE
  })
  const sorted = rowKids.toSorted((a, b) => boxOf(a).y - boxOf(b).y)
  const stacked = sorted.every((k, index) => {
    const before = sorted[index - 1]
    return before === undefined || boxOf(k).y >= boxOf(before).y + boxOf(before).h - EDGE_PX
  })
  return rowKids.length >= SCROLL_ROWS && stacked
}

function kids(node: DesignNode): DesignNode[] {
  return node.children.filter((child) => child.figma?.absolute !== true && boxOf(child).w > 0 && boxOf(child).h > 0)
}

function isRow(input: {node: DesignNode; ks: DesignNode[]}): boolean {
  const {node, ks} = input
  const mode = node.figma?.mode
  if (mode === 'HORIZONTAL') return true
  if (mode === 'VERTICAL' || ks.length < 2) return false
  const sorted = ks.toSorted((a, b) => boxOf(a).x - boxOf(b).x)
  return sorted.every((k, index) => {
    const before = sorted[index - 1]
    return before === undefined || boxOf(k).x >= boxOf(before).x + boxOf(before).w - EDGE_PX
  })
}

function sameComponent(ks: DesignNode[]): boolean {
  return (
    ks.length >= WRAP_COUNT &&
    ks.every((k) => k.figma?.type === 'INSTANCE') &&
    new Set(ks.map((k) => k.figma?.name)).size === 1
  )
}

function sameWidth(ks: DesignNode[]): boolean {
  const widths = ks.map((k) => boxOf(k).w)
  return ks.length >= WRAP_COUNT && Math.max(...widths) - Math.min(...widths) <= EDGE_PX
}

function boxOf(node: DesignNode): Box {
  return node.figma?.box ?? node.box
}
