import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, GeometryEstimator} from '../../shared/types.js'
import {edgeMap} from '../raster.js'

const MIN_EDGE_DENSITY = 0.01
const MIN_RUN_OVERLAP = 0.5

type Run = {start: number; end: number}

function findRuns(values: Uint32Array): Run[] {
  const runs: Run[] = []
  values.forEach((value, index) => {
    if (value === 0) return
    const last = runs.at(-1)
    if (last !== undefined && last.end === index - 1) {
      last.end = index
      return
    }
    runs.push({start: index, end: index})
  })
  return runs
}

function chooseSpan(input: {runs: Run[]; from: number; to: number}): Run | null {
  const chosen = input.runs.filter((run) => {
    const overlap = Math.min(run.end + 1, input.to) - Math.max(run.start, input.from)
    return overlap >= (run.end - run.start + 1) * MIN_RUN_OVERLAP
  })
  if (chosen.length === 0) return null
  return {start: Math.min(...chosen.map((run) => run.start)), end: Math.max(...chosen.map((run) => run.end))}
}

function projection(input: {
  edges: Uint8Array
  width: number
  columns: Run
  rows: Run
  byColumn: boolean
}): Uint32Array {
  const {edges, width, columns, rows, byColumn} = input
  const out = new Uint32Array(byColumn ? width : edges.length / width)
  for (let y = rows.start; y <= rows.end; y += 1) {
    for (let x = columns.start; x <= columns.end; x += 1) {
      if (edges[y * width + x] !== 1) continue
      const index = byColumn ? x : y
      out[index] = (out[index] ?? 0) + 1
    }
  }
  return out
}

function clamp(input: {from: number; to: number; size: number}): Run | null {
  const start = Math.max(0, Math.floor(input.from))
  const end = Math.min(input.size - 1, Math.ceil(input.to) - 1)
  return end < start ? null : {start, end}
}

function interior(run: Run): Run | null {
  return run.end - 1 < run.start + 1 ? null : {start: run.start + 1, end: run.end - 1}
}

function density(input: {edges: Uint8Array; width: number; columns: Run; rows: Run}): number {
  const count = projection({...input, byColumn: true}).reduce((sum, value) => sum + value, 0)
  return count / ((input.columns.end - input.columns.start + 1) * (input.rows.end - input.rows.start + 1))
}

export const edgeProjection: GeometryEstimator = {
  name: 'edge-projection',
  estimate: ({target, liveBox}) => {
    const {width, height} = target
    const margin = TOLERANCES.tileMargin
    const edges = edgeMap(target)
    const allRows = {start: 0, end: height - 1}
    const tileColumns = clamp({from: liveBox.x - margin, to: liveBox.x + liveBox.w + margin, size: width})
    const tileRows = clamp({from: liveBox.y - margin, to: liveBox.y + liveBox.h + margin, size: height})
    const band = clamp({from: liveBox.y, to: liveBox.y + liveBox.h, size: height})
    if (tileColumns === null || tileRows === null || band === null) return {targetBox: null}
    if (density({edges, width, columns: tileColumns, rows: tileRows}) < MIN_EDGE_DENSITY) return {targetBox: null}
    const columns = chooseSpan({
      runs: findRuns(projection({edges, width, columns: {start: 0, end: width - 1}, rows: band, byColumn: true})),
      from: liveBox.x,
      to: liveBox.x + liveBox.w,
    })
    if (columns === null) return {targetBox: null}
    const columnsInterior = interior(columns)
    if (columnsInterior === null) return {targetBox: null}
    const rows = chooseSpan({
      runs: findRuns(projection({edges, width, columns: columnsInterior, rows: allRows, byColumn: false})),
      from: liveBox.y,
      to: liveBox.y + liveBox.h,
    })
    if (rows === null) return {targetBox: null}
    const box: Box = {
      x: columns.start + 1,
      y: rows.start + 1,
      w: columns.end - columns.start - 1,
      h: rows.end - rows.start - 1,
    }
    return {targetBox: box.w > 0 && box.h > 0 ? box : null}
  },
}
