import {type Item, type Ranker} from '../shared/defs.js'

export const rankByImpact: Ranker = (input: {items: Item[]}): Item[] =>
  input.items.toSorted(
    (a, b) => b.confidence * b.size - a.confidence * a.size || a.box.y - b.box.y || a.depth - b.depth,
  )
