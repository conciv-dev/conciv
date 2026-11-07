import {range} from 'es-toolkit'
import type {Box, Design, GateRow, IdNode, Raster, Round} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export function progressOf(input: {
  rounds: Round[]
  now: Pick<Round, 'rows' | 'coverage' | 'pixels'>
  live: {now: Raster; before: Raster | null; width: number}
  root: IdNode
  design: Design
  comparator: string
}): Progress | null {
  const {rounds, now} = input
  const before = rounds.at(-1)
  if (before === undefined) return null
  const earlier = new Set(before.rows.map(rowKey))
  const present = new Set(now.rows.map(rowKey))
  const kept = now.rows
    .filter((row) => earlier.has(rowKey(row)))
    .map((row) => ({node: row.node, id: row.id, text: row.text, repeat: repeatOf({rounds, key: rowKey(row)})}))
  const changed = changedOf(input)
  return {
    closed: before.rows.filter((row) => !present.has(rowKey(row))).length,
    opened: now.rows.filter((row) => !earlier.has(rowKey(row))).length,
    kept,
    mapped: {
      gained: before.coverage.missing.filter((node) => !now.coverage.missing.includes(node)),
      lost: now.coverage.missing.filter((node) => !before.coverage.missing.includes(node)),
    },
    pixels: {now: now.pixels?.share ?? null, before: before.pixels?.share ?? null},
    changed,
    note: changed?.ratio === 0 && kept.length > 0 ? UNCHANGED_NOTE : null,
  }
}

type Progress = NonNullable<Round['progress']>

type Changed = NonNullable<Progress['changed']>

type Edges = {x1: number; y1: number; x2: number; y2: number}

const TOLERANCES = designConfig.tolerances

const UNCHANGED_NOTE = 'your edits since the last check changed no pixels'

const RATIO_DIGITS = 1e6

function rowKey(row: GateRow): string {
  return JSON.stringify([row.node, row.magnitude, row.text, row.width ?? null])
}

function repeatOf(input: {rounds: Round[]; key: string}): number {
  const back = input.rounds.toReversed()
  const ended = back.findIndex((round) => !round.rows.some((row) => rowKey(row) === input.key))
  return ended === -1 ? back.length : ended
}

function changedOf(input: Parameters<typeof progressOf>[0]): Changed | null {
  const {now, before, width} = input.live
  if (before === null) return null
  const area = {x: 0, y: 0, w: Math.min(now.width, before.width), h: Math.min(now.height, before.height)}
  const {mismatch, mask} = now
    .crop({box: area})
    .compare({other: before.crop({box: area}), comparator: input.comparator})
  const found = regionsOf({mask, width: area.w, height: area.h, scale: now.width / width})
  const shown = found.length > TOLERANCES.changedRegions ? [boxes.union(found)] : found
  const sites = [...walk(input.root)].map(({node}) => node)
  const names = new Map([...walk(input.design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
  return {
    ratio: Math.round(mismatch * RATIO_DIGITS) / RATIO_DIGITS,
    regions: shown.map((region) => ({box: region, ids: idsOf({region, sites, names})})),
    truncated: shown.length < found.length,
    count: found.length,
  }
}

function regionsOf(input: {mask: Uint8Array; width: number; height: number; scale: number}): Box[] {
  return clustered(input)
    .map((edges) => cssBox({edges, scale: input.scale}))
    .filter((region) => Math.max(region.w, region.h) >= TOLERANCES.changedMinSide)
    .filter((region) => region.w * region.h >= TOLERANCES.changedMinArea)
    .toSorted((a, b) => b.w * b.h - a.w * a.h || a.y - b.y || a.x - b.x)
}

function cssBox(input: {edges: Edges; scale: number}): Box {
  const {edges, scale} = input
  const x = Math.floor(edges.x1 / scale)
  const y = Math.floor(edges.y1 / scale)
  return {x, y, w: Math.ceil((edges.x2 + 1) / scale) - x, h: Math.ceil((edges.y2 + 1) / scale) - y}
}

function clustered(input: {mask: Uint8Array; width: number; height: number}): Edges[] {
  const {mask, width, height} = input
  const side = TOLERANCES.changedTile
  const columns = Math.ceil(width / side)
  const rows = Math.ceil(height / side)
  const tiles = new Map<number, Edges>()
  mask.forEach((value, index) => {
    if (value !== 1) return
    const x = index % width
    const y = (index - x) / width
    const tile = Math.floor(y / side) * columns + Math.floor(x / side)
    const point = {x1: x, y1: y, x2: x, y2: y}
    tiles.set(tile, joined({a: tiles.get(tile) ?? point, b: point}))
  })
  const seen = new Set<number>()
  return [...tiles.keys()].flatMap((start) => {
    if (seen.has(start)) return []
    seen.add(start)
    const stack = [start]
    const cluster = {edges: tiles.get(start) ?? {x1: 0, y1: 0, x2: 0, y2: 0}}
    while (stack.length > 0) {
      const current = stack.pop() ?? start
      cluster.edges = joined({a: cluster.edges, b: tiles.get(current) ?? cluster.edges})
      for (const near of neighbours({tile: current, columns, rows})) {
        if (seen.has(near) || !tiles.has(near)) continue
        seen.add(near)
        stack.push(near)
      }
    }
    return [cluster.edges]
  })
}

function neighbours(input: {tile: number; columns: number; rows: number}): number[] {
  const {tile, columns, rows} = input
  const gap = TOLERANCES.changedGapTiles
  const cx = tile % columns
  const cy = (tile - cx) / columns
  const xs = range(Math.max(0, cx - gap), Math.min(columns - 1, cx + gap) + 1)
  return range(Math.max(0, cy - gap), Math.min(rows - 1, cy + gap) + 1).flatMap((ny) =>
    xs.map((nx) => ny * columns + nx),
  )
}

function joined(input: {a: Edges; b: Edges}): Edges {
  const {a, b} = input
  return {x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2)}
}

function idsOf(input: {region: Box; sites: IdNode[]; names: Map<string, string>}): Changed['regions'][number]['ids'] {
  const {region, sites, names} = input
  return sites
    .flatMap((site) => {
      const hits = site.dom.flatMap((dom) => {
        const shared = boxes.intersection({a: region, b: dom.box})
        return shared === null ? [] : [{dom, overlap: boxes.area(shared), size: boxes.area(dom.box)}]
      })
      const best = hits.toSorted((a, b) => b.overlap - a.overlap || a.size - b.size)[0]
      return best === undefined || best.overlap <= 0 ? [] : [{site, ...best}]
    })
    .toSorted((a, b) => b.overlap - a.overlap || a.size - b.size)
    .slice(0, TOLERANCES.changedIds)
    .map(({site, dom, overlap}) => {
      const node = site.fom.find((entry) => entry.instance === null || entry.instance === dom.instance)?.nodeId ?? null
      const at = site.src.at
      return {
        id: site.id,
        node,
        name: node === null ? null : (names.get(node) ?? null),
        source: at === null ? null : `${at.file}:${at.line}:${at.column}`,
        overlap: Math.round((overlap / boxes.area(region)) * RATIO_DIGITS) / RATIO_DIGITS,
      }
    })
}
