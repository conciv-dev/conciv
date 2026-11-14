import {groupBy, maxBy} from 'es-toolkit'
import type {DesignNode, GateRow} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import type {readIds} from '../shared/id-tree.js'

export function driftRows(input: {root: DesignNode; reads: ReturnType<typeof readIds>; width: number}): GateRow[] {
  const {root, reads, width} = input
  const placed = [...walk(root)].flatMap(({node, parent}) => {
    const [element] = reads.of(node.id)
    if (element === undefined || element.bounds.w <= 0 || node.kind === 'text' || node.figma?.absolute === true)
      return []
    return [{node, parent, top: element.bounds.y}]
  })
  const origin = placed.find((entry) => entry.node === root)?.top ?? 0
  const drifts = placed.map((entry) => ({
    ...entry,
    by: Math.round(entry.top - origin - (entry.node.box.y - root.box.y)),
  }))
  const worst = maxBy(drifts, (entry) => Math.abs(entry.by))
  if (worst === undefined || Math.abs(worst.by) < SHARED_PX) return []
  const shifted = drifts.filter(
    (entry) => Math.abs(entry.by) >= SHARED_PX && Math.sign(entry.by) === Math.sign(worst.by),
  )
  if (Math.abs(worst.by) <= DRIFT_PX && shifted.length < drifts.length * DRIFT_SHARE) return []
  const byNode = new Map(drifts.map((entry) => [entry.node.id, entry]))
  const siblings = groupBy(drifts, (entry) => entry.parent?.id ?? '')
  const steps = Object.values(siblings).flatMap((group) => {
    const ordered = group.toSorted((a, b) => a.node.box.y - b.node.box.y)
    return ordered.flatMap((entry, index) => {
      const before = ordered[index - 1] ?? (entry.parent === null ? undefined : byNode.get(entry.parent.id))
      if (before === undefined) return []
      const step = entry.by - before.by
      const inside = ordered[index - 1] === undefined
      return Math.sign(step) === Math.sign(worst.by) ? [{at: before.node, step, inside}] : []
    })
  })
  const named = steps
    .toSorted((a, b) => Math.abs(b.step) - Math.abs(a.step))
    .slice(0, NAMED)
    .map(({at, step, inside}) => `${Math.abs(step)} px ${inside ? 'inside' : 'below'} ${labelOf(at)}`)
  const way = worst.by > 0 ? 'lower' : 'higher'
  return [
    {
      node: worst.node.id,
      ...reads.named(worst.node.id),
      kind: designConfig.rowKinds.page,
      name: worst.node.figma?.name ?? '',
      text: `the page drifts from the design: ${labelOf(worst.node)} sits ${Math.abs(worst.by)} px ${way} on the page than in the frame; the drift grows ${named.join(', ')}`,
      magnitude: 'reflow',
      width,
      property: 'top',
      expected: `${Math.round(worst.node.box.y - root.box.y)}px`,
      actual: `${Math.round(worst.node.box.y - root.box.y + worst.by)}px`,
      delta: worst.by,
    },
  ]
}

const DRIFT_PX = designConfig.tolerances.geometryPx

const DRIFT_SHARE = designConfig.tolerances.driftShare

const SHARED_PX = 1

const NAMED = 6

function labelOf(node: DesignNode): string {
  return `${node.figma?.name ?? node.id} [${node.id}]`
}
