import {type Item, type Ranker} from '../shared/defs.js'

export function createRanker(): Ranker {
  return impactRanker
}

function impactRanker(input: {items: Item[]}): Item[] {
  return input.items.toSorted(
    (a, b) => b.confidence * b.size - a.confidence * a.size || a.box.y - b.box.y || a.depth - b.depth,
  )
}
