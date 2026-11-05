import {type Box, type Raster, type Similarity, type VoteContext, type VoteView, type Voter} from '../../shared/defs.js'
import {INK_SHARE, glyphSized, TOLERANCES} from '../../shared/tolerances.js'

const VOTERS: Voter[] = [
  {name: 'text', base: 0.3, score: textVote},
  {name: 'kind', base: 0.1, score: kindVote},
  {name: 'structure', base: 0.2, score: structureVote},
  {name: 'style', base: 0.1, score: styleVote},
  {name: 'geometry', base: 0.2, score: geometryVote},
  {name: 'pixel', base: 0.1, score: pixelVote},
  {name: 'hints', base: 0.1, score: hintsVote},
  {name: 'twins', base: 0.1, score: twinsVote},
]

export const SIMILARITY: Similarity = {voters: VOTERS, text: similarity}

function textVote(input: {node: VoteView; candidate: VoteView; context: VoteContext}): number | null {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || node.text === '') return null
  if (glyphSized(node)) return null
  if (candidate.media && context.geometry.holds({outer: candidate.box, inner: node.box}))
    return 1 - bestText({node, context})
  if (candidate.text === '') return 0
  return similarity({a: node.text, b: candidate.text})
}

function bestText(input: {node: VoteView; context: VoteContext}): number {
  const {node, context} = input
  const known = context.bestText.get(node.key)
  if (known !== undefined) return known
  const best = Math.max(
    0,
    ...context.candidates
      .filter((candidate) => candidate.text !== '')
      .map((candidate) => similarity({a: node.text, b: candidate.text})),
  )
  context.bestText.set(node.key, best)
  return best
}

function similarity(input: {a: string; b: string}): number {
  const {a, b} = input
  if (a === b) return 1
  if (Math.min(a.length, b.length) < SHORT_TEXT) return 1 - levenshtein({a, b}) / Math.max(a.length, b.length, 1)
  return dice({a, b})
}

function levenshtein(input: {a: string; b: string}): number {
  const a = [...input.a]
  const b = [...input.b]
  const first = Array.from({length: b.length + 1}, (_, index) => index)
  const last = a.reduce(
    (row, char, i) =>
      row.reduce<number[]>((next, cost, j) => {
        if (j === 0) return [i + 1]
        const replace = (row[j - 1] ?? 0) + (b[j - 1] === char ? 0 : 1)
        return [...next, Math.min(cost + 1, (next[j - 1] ?? 0) + 1, replace)]
      }, []),
    first,
  )
  return last.at(-1) ?? 0
}

function dice(input: {a: string; b: string}): number {
  const left = bigrams(input.a)
  const right = bigrams(input.b)
  if (left.length + right.length === 0) return 0
  const counts = new Map<string, number>()
  left.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1))
  const shared = right.filter((gram) => {
    const count = counts.get(gram) ?? 0
    if (count === 0) return false
    counts.set(gram, count - 1)
    return true
  }).length
  return (2 * shared) / (left.length + right.length)
}

function bigrams(text: string): string[] {
  const chars = [...text]
  return chars.slice(1).map((char, index) => `${chars[index] ?? ''}${char}`)
}

function kindVote(input: {node: VoteView; candidate: VoteView}): number | null {
  const {node, candidate} = input
  if (node.klass === candidate.klass) return 1
  if (node.kind === 'text' && candidate.klass === 'media') return MEDIA_TEXT
  return 0
}

function structureVote(input: {node: VoteView; candidate: VoteView; context: VoteContext}): number | null {
  const {node, candidate, context} = input
  const order = ORDER * (1 - Math.abs(node.rank - candidate.rank))
  if (node.parent === null) return UNDER + order
  const anchor = context.assigned.get(node.parent.key)
  if (anchor === undefined) return null
  return (inside({view: candidate, anchor}) ? UNDER : 0) + order
}

function styleVote(input: {node: VoteView; candidate: VoteView}): number | null {
  const {node, candidate} = input
  if (node.kind === 'text') {
    if (node.ink === null || candidate.ink === null) return null
    const size = Math.max(node.ink, candidate.ink) / INK_SHARE
    return Math.max(0, 1 - Math.abs(node.ink - candidate.ink) / (INK_SPREAD * size))
  }
  if (node.fill === null || candidate.fill === null) return null
  const apart = Math.hypot(...node.fill.map((channel, index) => channel - (candidate.fill?.[index] ?? channel)))
  return Math.max(0, 1 - apart / (TOLERANCES.segmentDistance * STYLE_SPREAD))
}

function geometryVote(input: {node: VoteView; candidate: VoteView; context: VoteContext}): number | null {
  const {node, candidate, context} = input
  const {centre, distance, nearestLine} = context.geometry
  const box =
    node.kind === 'text' ? (nearestLine({lines: candidate.lines, box: node.box}) ?? candidate.box) : candidate.box
  const page = distance({a: centre(node.box), b: centre(box)}) / context.diagonal
  const anchor = node.parent === null ? undefined : context.assigned.get(node.parent.key)
  const nodeOrigin = anchor === undefined || node.parent === null ? {x: 0, y: 0} : node.parent.box
  const candidateOrigin = anchor === undefined ? {x: 0, y: 0} : anchor.box
  const a = centre(node.box)
  const b = centre(box)
  const local = distance({
    a: {x: a.x - nodeOrigin.x, y: a.y - nodeOrigin.y},
    b: {x: b.x - candidateOrigin.x, y: b.y - candidateOrigin.y},
  })
  return PAGE_SHARE * Math.max(0, 1 - page) + LOCAL_SHARE * Math.max(0, 1 - local / LOCAL_REACH)
}

function pixelVote(input: {node: VoteView; candidate: VoteView; context: VoteContext}): number | null {
  const {node, candidate, context} = input
  const box =
    node.kind === 'text'
      ? (context.geometry.nearestLine({lines: candidate.lines, box: node.box}) ?? candidate.box)
      : candidate.box
  const a = hashed({raster: context.nodeRaster, box: node.box, context, side: 'node'})
  const b = hashed({raster: context.candidateRaster, box, context, side: 'candidate'})
  const differing = a.reduce((sum, bit, index) => sum + (bit === b[index] ? 0 : 1), 0)
  return 1 - differing / HASH_BITS
}

function hashed(input: {raster: Raster; box: Box; context: VoteContext; side: string}): Uint8Array {
  const {raster, box, context} = input
  const key = `${input.side}:${box.x},${box.y},${box.w},${box.h}`
  const known = context.hashes.get(key)
  if (known !== undefined) return known
  const made = averageHash({raster, box})
  context.hashes.set(key, made)
  return made
}

function averageHash(input: {raster: Raster; box: Box}): Uint8Array {
  const {raster, box} = input
  const cells = Float64Array.from({length: HASH_BITS}, (_, cell) => cellLuminance({raster, box, cell}))
  const mean = cells.reduce((sum, value) => sum + value, 0) / HASH_BITS
  return Uint8Array.from(cells, (value) => (value > mean ? 1 : 0))
}

function cellLuminance(input: {raster: Raster; box: Box; cell: number}): number {
  const {raster, box, cell} = input
  const cx = cell % HASH_SIDE
  const cy = (cell - cx) / HASH_SIDE
  const x0 = Math.max(0, Math.floor(box.x + (cx * box.w) / HASH_SIDE))
  const y0 = Math.max(0, Math.floor(box.y + (cy * box.h) / HASH_SIDE))
  const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.floor(box.x + ((cx + 1) * box.w) / HASH_SIDE)))
  const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.floor(box.y + ((cy + 1) * box.h) / HASH_SIDE)))
  const stepX = Math.max(1, Math.floor((x1 - x0) / HASH_SAMPLES))
  const stepY = Math.max(1, Math.floor((y1 - y0) / HASH_SAMPLES))
  const columns = Math.ceil(Math.max(0, x1 - x0) / stepX)
  const count = columns * Math.ceil(Math.max(0, y1 - y0) / stepY)
  if (count === 0) return 0
  const total = Array.from({length: count}, (_, sample) => {
    const x = x0 + (sample % columns) * stepX
    const y = y0 + Math.floor(sample / columns) * stepY
    return luminanceAt({raster, index: (y * raster.width + x) * 4})
  }).reduce((sum, value) => sum + value, 0)
  return total / count
}

function luminanceAt(input: {raster: Raster; index: number}): number {
  const {data} = input.raster
  const {index} = input
  return (data[index] ?? 0) * 0.299 + (data[index + 1] ?? 0) * 0.587 + (data[index + 2] ?? 0) * 0.114
}

function hintsVote(input: {node: VoteView; candidate: VoteView}): number | null {
  const {node, candidate} = input
  if (candidate.tokens.length === 0) return null
  const wanted = new Set([node.klass, ...node.text.split(' ')])
  const matched = candidate.tokens.filter((token) => wanted.has(token)).length
  return matched === 0 ? null : matched / candidate.tokens.length
}

function twinsVote(input: {node: VoteView; candidate: VoteView; context: VoteContext}): number | null {
  return input.context.twins.get(input.node.key) === input.candidate.key ? 1 : null
}

const HASH_SIDE = 8

const HASH_BITS = HASH_SIDE * HASH_SIDE

const HASH_SAMPLES = 4

const STYLE_SPREAD = 3

const SHORT_TEXT = 6

const MEDIA_TEXT = 0.4

const ORDER = 0.4

const UNDER = 0.6

const INK_SPREAD = 0.3

const PAGE_SHARE = 0.4

const LOCAL_SHARE = 0.6

const LOCAL_REACH = 40

function inside(input: {view: VoteView; anchor: VoteView}): boolean {
  if (input.view === input.anchor) return true
  const parent = input.view.parent
  return parent !== null && inside({view: parent, anchor: input.anchor})
}
