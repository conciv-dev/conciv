import {range} from 'es-toolkit'
import {nodeId} from '../shared/model-schemas.js'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, Enricher, OcrLine, Raster, TargetModel, TargetNode, TextNode, TextReader} from '../shared/types.js'
import {ciede2000} from './comparators/ciede2000.js'
import {sampledFills} from './deltas/colors.js'
import {crop, trimToInk} from './raster.js'
import {overlapping, sameLine, union} from './text-groups.js'

export const TEXT_ENRICHER = 'text'

const UPSAMPLE = 2

function upsampled(raster: Raster): Raster {
  const width = raster.width * UPSAMPLE
  const height = raster.height * UPSAMPLE
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / UPSAMPLE) * raster.width + Math.floor(x / UPSAMPLE)) * 4
      data.set(raster.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return {width, height, data}
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function scaled(input: {line: OcrLine; by: number; dy: number}): OcrLine {
  const {line, by, dy} = input
  const {box} = line
  return {...line, box: {x: box.x / by, y: box.y / by + dy, w: box.w / by, h: box.h / by}}
}

function onSeam(input: {line: OcrLine; tile: Box; raster: Raster}): boolean {
  const {line, tile, raster} = input
  const top = tile.y > 0 && line.box.y <= tile.y + 1
  const bottom = tile.y + tile.h < raster.height && line.box.y + line.box.h >= tile.y + tile.h - 1
  return top || bottom
}

async function readTile(input: {raster: Raster; tile: Box; reader: TextReader}): Promise<OcrLine[]> {
  const {raster, tile, reader} = input
  const part = crop({raster, box: tile}).raster
  const lines = await reader.read({raster: part})
  const small = lines.length > 0 && median(lines.map((line) => line.box.h)) < TOLERANCES.ocrUpsampleBelowPx
  const read = small
    ? (await reader.read({raster: upsampled(part)})).map((line) => scaled({line, by: UPSAMPLE, dy: tile.y}))
    : lines.map((line) => scaled({line, by: 1, dy: tile.y}))
  return read.filter((line) => !onSeam({line, tile, raster}))
}

function tiles(raster: Raster): Box[] {
  const height = Math.min(raster.height, TOLERANCES.ocrTileHeight)
  const stride = height - TOLERANCES.ocrTileOverlap
  const count = raster.height <= height ? 1 : Math.ceil((raster.height - height) / stride) + 1
  return range(count).map((index) => {
    const y = Math.min(index * stride, raster.height - height)
    return {x: 0, y, w: raster.width, h: height}
  })
}

function joinsRow(input: {row: OcrLine[]; line: OcrLine}): boolean {
  const last = input.row.at(-1)
  if (last === undefined) return false
  const {box} = input.line
  const gap = box.x - (last.box.x + last.box.w)
  return sameLine({a: last.box, b: box}) && gap < Math.max(last.box.h, box.h)
}

function rows(lines: OcrLine[]): OcrLine[][] {
  return lines
    .toSorted((a, b) => a.box.x - b.box.x)
    .reduce<OcrLine[][]>((found, line) => {
      const row = found.find((candidate) => joinsRow({row: candidate, line}))
      if (row === undefined) return [...found, [line]]
      row.push(line)
      return found
    }, [])
}

function textNode(row: OcrLine[]): TextNode {
  const text = row.map((line) => line.text.trim()).join(' ')
  const box = union(row.map((line) => line.box))
  return {
    id: nodeId({kind: 'text', box, text}),
    kind: 'text',
    box,
    text,
    lines: row,
    confidence: Math.min(...row.map((line) => line.confidence)),
  }
}

const textEnricher: Enricher = {
  name: TEXT_ENRICHER,
  run: async ({model, raster, runtime}) => {
    if (model.nodes.some((node) => node.kind === 'text')) return model.nodes
    const read = await Promise.all(
      tiles(raster).map((tile) => readTile({raster, tile, reader: runtime.comparators.text})),
    )
    const lines = read
      .flat()
      .filter((line) => line.confidence >= TOLERANCES.ocrConfidenceFloor && line.text.trim() !== '')
      .map((line) => ({...line, box: trimToInk({raster, box: line.box})}))
      .reduce<OcrLine[]>(
        (kept, line) => (kept.some((other) => overlapping({a: other.box, b: line.box})) ? kept : [...kept, line]),
        [],
      )
    return [...model.nodes, ...rows(lines).map(textNode)]
  },
}

type Segmentation = 'full' | 'partial'

function area(box: Box): number {
  return box.w * box.h
}

function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  const slack = TOLERANCES.geometryPx
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  )
}

function within(input: {node: TargetNode; nodes: TargetNode[]}): TargetNode {
  const {node, nodes} = input
  const [smallest] = nodes
    .filter(
      (other) =>
        other.kind === 'box' &&
        other.id !== node.id &&
        area(other.box) > area(node.box) &&
        holds({outer: other.box, inner: node.box}),
    )
    .toSorted((a, b) => area(a.box) - area(b.box))
  return smallest === undefined ? node : {...node, within: smallest.id}
}

export function segmentationQuality(model: Pick<TargetModel, 'nodes' | 'viewport'>): Segmentation {
  const page = model.viewport.width * model.viewport.height
  const covered = model.nodes
    .filter((node) => node.kind === 'image' && node.within === undefined)
    .reduce((sum, node) => sum + area(node.box), 0)
  return page > 0 && covered / page > TOLERANCES.segmentImageShare ? 'partial' : 'full'
}

const segmentEnricher: Enricher = {
  name: 'segment',
  run: async ({model, raster, runtime}) => {
    if (model.nodes.some((node) => node.kind !== 'text')) return model.nodes
    const found = await runtime.segmenter.segment({raster, nodes: model.nodes})
    const nodes = [...model.nodes, ...found]
    return nodes.map((node) => within({node, nodes}))
  },
}

const rolesEnricher: Enricher = {
  name: 'roles',
  run: ({model, runtime}) =>
    Promise.resolve(
      model.nodes.map((node) => {
        if (node.kind !== 'text' || node.role !== undefined) return node
        const neighbours = model.nodes.flatMap((other) =>
          other.kind === 'text' && other.id !== node.id && other.within === node.within ? [other.text] : [],
        )
        const {role, confidence} = runtime.roles({text: node.text, neighbours})
        return {...node, role, roleConfidence: confidence}
      }),
    ),
}

const colorEnricher: Enricher = {
  name: 'color',
  run: ({model, raster}) =>
    Promise.resolve(
      model.nodes.map((node) => {
        if (node.kind !== 'box' || node.paint !== undefined) return node
        const {background} = sampledFills({raster, box: node.box, glyphs: [node.box], color: ciede2000})
        return {...node, paint: {background}}
      }),
    ),
}

export const ENRICHERS: Enricher[] = [textEnricher, segmentEnricher, rolesEnricher, colorEnricher]
