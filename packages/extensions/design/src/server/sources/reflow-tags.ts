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
  const reflow = reflowOf({...node, children})
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
  const breakpoint = rowMinimum({node, ks})
  if (sameComponent(ks) || (sameWidth(ks) && narrowest >= WRAP_NARROWEST))
    return {kind: 'wrap', minChildWidth, breakpoint}
  if (narrowest >= STACK_NARROWEST && sum > STACK_SUM && boxOf(node).w > WIDE_PX)
    return {kind: 'stack', minChildWidth, breakpoint}
  return null
}

function rowMinimum(input: {node: DesignNode; ks: DesignNode[]}): number {
  const {node, ks} = input
  const columns = ks
    .map((k) => ({box: boxOf(k), least: ownMinimum(k)}))
    .toSorted((a, b) => a.box.x - b.box.x)
    .reduce<{box: Box; least: number}[]>((found, column) => {
      const last = found.at(-1)
      const {box} = column
      if (last === undefined || box.x >= last.box.x + last.box.w - EDGE_PX) return [...found, column]
      const right = Math.max(last.box.x + last.box.w, box.x + box.w)
      return [
        ...found.slice(0, -1),
        {box: {...last.box, w: right - last.box.x}, least: Math.max(last.least, column.least)},
      ]
    }, [])
  const flowGap = node.layout?.direction === undefined ? undefined : node.layout.gap?.px
  const gaps =
    flowGap === undefined
      ? columns.reduce((total, {box}, index) => {
          const before = columns[index - 1]?.box
          return before === undefined ? total : total + Math.max(0, box.x - before.x - before.w)
        }, 0)
      : flowGap * (columns.length - 1)
  const least = columns.reduce((total, column) => total + column.least, 0)
  return Math.round(least + gaps + padding({node, boxes: columns.map((column) => column.box)}))
}

function ownMinimum(node: DesignNode): number {
  const least = node.reflow?.minChildWidth
  if (least !== undefined) return least
  const ks = kids(node)
  if (ks.length === 0) return boxOf(node).w
  if (isRow({node, ks})) return rowMinimum({node, ks})
  return Math.max(...ks.map(ownMinimum)) + padding({node, boxes: ks.map(boxOf)})
}

function padding(input: {node: DesignNode; boxes: Box[]}): number {
  const flow = input.node.layout
  if (flow?.direction !== undefined && flow.padding !== undefined) return flow.padding.left + flow.padding.right
  const own = boxOf(input.node)
  const left = Math.min(...input.boxes.map((box) => box.x)) - own.x
  const right = own.x + own.w - Math.max(...input.boxes.map((box) => box.x + box.w))
  return Math.max(0, left) + Math.max(0, right)
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
