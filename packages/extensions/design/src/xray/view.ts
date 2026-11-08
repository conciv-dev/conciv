import {createMemo} from 'solid-js'
import {groupBy, uniq} from 'es-toolkit'
import type {GateRow} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import type {createXrayData} from './data.js'
import type {createXrayState} from './state.js'

export function createXrayView(input: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
}) {
  const {state} = input.xray
  const {design, layers, shownRound} = input.data
  const target = createMemo(() => design.latest?.target ?? null)
  const rounds = createMemo(() => design.latest?.rounds ?? [])
  const lastRound = createMemo(() => rounds().at(-1) ?? null)
  const designWidth = createMemo(() => target()?.width ?? 0)
  const widths = createMemo(() => {
    const reflowed = shownRound()?.reflow.widths.map((entry) => entry.width) ?? []
    return uniq([designWidth(), ...reflowed.toSorted((left, right) => right - left)])
  })
  const shownWidth = createMemo(() => {
    const wanted = state.width
    return wanted !== null && widths().includes(wanted) ? wanted : designWidth()
  })
  const atDesignWidth = createMemo(() => shownWidth() === designWidth())
  const rows = createMemo(() => {
    const listed = (shownRound()?.rows ?? []).map((row) => ({...row, kind: kindOf(row.magnitude)}))
    if (atDesignWidth()) return listed.filter((row) => row.magnitude !== 'reflow')
    return listed.filter((row) => row.magnitude === 'reflow' && row.width === shownWidth())
  })
  const rowsById = createMemo(() => groupBy(rows(), (row) => row.id ?? ''))
  const tree = createMemo(() => layers.latest ?? null)
  const entries = createMemo(() => {
    const root = tree()?.root
    if (root === undefined) return []
    return [...walk(root)]
      .filter(({node}) => node.id !== ROOT_ID)
      .map(({node}) => {
        const own = rowsById()[node.id] ?? []
        const look = node.fom.find((entry) => entry.look !== null)?.look ?? null
        return {
          node,
          rows: own,
          shown: shownOf(own),
          name: look?.name ?? node.src.element,
          paired: node.fom.length > 0,
        }
      })
  })
  const visible = createMemo(() => entries().filter((entry) => state.magnitudes[entry.shown]))
  const picked = createMemo(() => entries().find((entry) => entry.node.id === state.picked) ?? null)
  const roundPosition = createMemo(() => {
    const shown = shownRound()
    return shown === null ? 0 : rounds().findIndex((entry) => entry.round === shown.round) + 1
  })
  const moved = createMemo(() => {
    const shown = shownRound()
    if (shown === null) return false
    return shown.round !== lastRound()?.round || (design.latest?.unsettled ?? 0) > 0
  })
  const regions = createMemo(() => shownRound()?.progress?.changed?.regions ?? [])
  return {
    target,
    rounds,
    lastRound,
    designWidth,
    widths,
    shownWidth,
    atDesignWidth,
    rows,
    tree,
    entries,
    visible,
    picked,
    roundPosition,
    moved,
    regions,
  }
}

const ROOT_ID = ''

const SEVERITY = ['much', 'noticeably', 'reflow', 'paint', 'slightly'] as const

function shownOf(rows: {kind: Kind}[]): Kind | 'matched' {
  const kinds = rows.map((row) => row.kind)
  return SEVERITY.find((magnitude) => kinds.includes(magnitude)) ?? 'matched'
}

type Kind = (typeof SEVERITY)[number]

function kindOf(magnitude: GateRow['magnitude']): Kind {
  return magnitude === 'pin' || magnitude === 'other' ? 'slightly' : magnitude
}
