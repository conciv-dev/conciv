import type {Design, Round} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function widthsOf(input: {design: Design; styles: number[]}): Round['reflow']['widths'] {
  const {design} = input
  const tags = [...walk(design.root)].flatMap(({node}) => (node.reflow === undefined ? [] : [{...node.reflow, node}]))
  const floor = Math.min(...tags.flatMap((tag) => (tag.minChildWidth === undefined ? [] : [tag.minChildWidth])))
  const named = [
    {width: Math.round(design.root.figma?.box.w ?? design.root.box.w), from: 'design'},
    ...tags.flatMap((tag) =>
      tag.kind === 'scroll' || tag.breakpoint === undefined
        ? []
        : pair({width: tag.breakpoint, from: `${tag.kind} ${tag.node.id}`}),
    ),
    ...input.styles.flatMap((width) => pair({width, from: `query ${width}`})),
  ].filter((entry) => !(entry.width < floor))
  const grouped = new Map<number, string[]>()
  named.forEach((entry) => grouped.set(entry.width, [...(grouped.get(entry.width) ?? []), entry.from]))
  return [...grouped].toSorted(([a], [b]) => a - b).map(([width, from]) => ({width, from}))
}

function pair(input: {width: number; from: string}): {width: number; from: string}[] {
  return [input, {width: input.width - 1, from: `${input.from} - 1`}]
}
