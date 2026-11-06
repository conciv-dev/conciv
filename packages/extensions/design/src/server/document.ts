import type {Design, Got, Mapping} from '../shared/defs.js'

export function documentOf(input: {target: string; design: Design; mapping: Mapping}): Got {
  const {design} = input
  return {target: input.target, root: design.root.id, count: 0, viewport: design.viewport, rules: [], nodes: []}
}
