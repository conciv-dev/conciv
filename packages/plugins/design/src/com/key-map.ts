import {createHash} from 'node:crypto'
import {diffArrays} from 'diff'
import type {JSXOpeningElement} from 'oxc-parser'

export type Opening = {readonly text: string; readonly tag: string}

export type KeyedFile = {readonly openings: Opening[]; readonly keys: Array<string | null>}

export type KeyMap = Map<string, KeyedFile>

type Pair = readonly [number, number]

type Gap = {from: number; fromEnd: number; to: number; toEnd: number}

type Walk = {from: number; to: number; gapFrom: number; gapTo: number; pairs: Pair[]; gaps: Gap[]}

export function readOpenings(text: string, openings: JSXOpeningElement[]): Opening[] {
  return openings.map((node) => ({
    text: text.slice(node.start, node.end),
    tag: text.slice(node.name.start, node.name.end),
  }))
}

export function mintKey(input: {relativePath: string; index: number; text: string}): string {
  return createHash('shake256', {outputLength: 4})
    .update(JSON.stringify([input.relativePath, input.index, input.text]))
    .digest('base64url')
}

export function carriedKeys(before: KeyedFile | undefined, after: Opening[]): Map<number, string> {
  if (before === undefined) return new Map()
  const exact = align(before.openings, after, (left, right) => left.text === right.text)
  const retagged = exact.gaps.flatMap((gap) =>
    align(before.openings.slice(gap.from, gap.fromEnd), after.slice(gap.to, gap.toEnd), (left, right) => {
      return left.tag === right.tag
    }).pairs.map(([from, to]): Pair => [from + gap.from, to + gap.to]),
  )
  return new Map(
    [...exact.pairs, ...retagged].flatMap(([from, to]) => {
      const key = before.keys[from]
      return key === null || key === undefined ? [] : [[to, key] as const]
    }),
  )
}

function align(
  before: Opening[],
  after: Opening[],
  same: (left: Opening, right: Opening) => boolean,
): {pairs: Pair[]; gaps: Gap[]} {
  const start: Walk = {from: 0, to: 0, gapFrom: 0, gapTo: 0, pairs: [], gaps: []}
  const walked = diffArrays(before, after, {comparator: same}).reduce((walk, change): Walk => {
    if (change.added) return {...walk, to: walk.to + change.count}
    if (change.removed) return {...walk, from: walk.from + change.count}
    const kept = Array.from({length: change.count}, (_unused, offset): Pair => [walk.from + offset, walk.to + offset])
    const from = walk.from + change.count
    const to = walk.to + change.count
    return {from, to, gapFrom: from, gapTo: to, pairs: [...walk.pairs, ...kept], gaps: withGap(walk)}
  }, start)
  return {pairs: walked.pairs, gaps: withGap(walked)}
}

function withGap(walk: Walk): Gap[] {
  if (walk.from === walk.gapFrom || walk.to === walk.gapTo) return walk.gaps
  return [...walk.gaps, {from: walk.gapFrom, fromEnd: walk.from, to: walk.gapTo, toEnd: walk.to}]
}
