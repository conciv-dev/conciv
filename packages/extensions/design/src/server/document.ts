import {toolError} from '@conciv/extension'
import type {DesignNode, Design, Got, IdTree} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {readIds} from '../shared/id-tree.js'

export function documentOf(input: {target: string; design: Design; ids: IdTree | null; node?: string}): Got {
  const {design} = input
  const reads = input.ids === null ? null : readIds({root: input.ids.root, live: null})
  const keys = new Map(
    [...walk(design.root)].flatMap(({node}) => {
      const selector = reads?.named(node.id).selector ?? null
      return selector === null ? [] : [[node.id, selector] as const]
    }),
  )
  const steps = [...walk(design.root)]
  const head = {
    target: input.target,
    root: design.root.id,
    count: steps.filter(({node}) => node.implied !== true).length,
    viewport: design.viewport,
    rules: rulesFor({design, implied: steps.some(({node}) => node.implied === true)}),
  }
  if (input.node === undefined)
    return {
      ...head,
      nodes: steps
        .filter(({depth}) => depth <= OUTLINE_DEPTH)
        .map(({node, parent, depth}) => outlined({tagged: tagged({node, parent, depth, keys}), node})),
    }
  const found = steps.find(({node}) => node.id === input.node)
  if (found === undefined)
    throw toolError('no-target', {message: `the design has no node ${input.node}; read the ids from the outline`})
  const parents = new Map(steps.map(({node, parent}) => [node.id, parent]))
  return {
    ...head,
    path: ancestorsOf({id: found.node.id, parents}),
    nodes: [...walk(found.node)].map(({node, parent, depth}) =>
      tagged({node, parent: parent ?? found.parent, depth: depth + found.depth, keys}),
    ),
  }
}

type Tagged = Got['nodes'][number]

const OUTLINE_DEPTH = 2

const OUTLINE_KEYS = ['id', 'type', 'name', 'within', 'depth', 'box', 'layout', 'implied', 'reflow', 'selector']

const OUTLINE =
  'design_get gives the outline; read each section with design_get and its node id before you build it; no call returns the whole design.'

const NODE_FIELDS =
  'Every node has its id, type, name, within (the node it sits in), absolute box, fills, strokes, text, font and auto-layout fields.'

const RULES = [
  'The dev server stamps data-conciv-key attributes into your JSX as you save; keep them, never strip or rewrite them, and edit around them.',
  'Lay the page out with normal flow, flex and grid: no position absolute, no px width or height on containers or text; sizes come from content, gaps and flex/grid rules, percentages and ratios, so the page stays a page and reflows at other widths.',
  'Every node marked image: true is an empty div with no background, border or fill, never a drawn svg, data url or CSS shape.',
  'Every image div gets its size from an aspect-ratio and a percentage width or flex-basis, never px.',
  'A node not marked image is a box: when it has a solid fill, that fill is its background, whether it is an icon, a logo, a dot or a drawing.',
  'A row whose auto-layout says wrap: WRAP keeps all its children on one line at the design width, exactly as the Figma frame shows them; it may wrap only when the viewport is narrower than the row is in the design, never at the design width.',
  'design_check returns the rows to fix and the verdict: a row without a width is about the page at the design width; a row with a width is about the page measured at that width, mostly narrower: it did not reflow as tagged, sticks out, overlaps a sibling or scrolls sideways.',
]

const IMPLIED_FIELDS =
  'nodes with implied: true are groups the design file does not have but its layout implies (a row or column of the siblings inside); build them as containers with their layout.'

const REFLOW_FIELDS =
  'reflow on a node: {kind: stack | wrap | scroll, minChildWidth}. While the viewport lets every child keep at least minChildWidth px, the node lays out as the boxes say. Once a child would have to go narrower than that: stack means its children go one under another (a column); wrap means its children wrap onto more lines; scroll means the node scrolls horizontally inside its own box instead of wrapping. Nothing may ever run outside the node.'

function rulesFor(input: {design: Design; implied: boolean}): string[] {
  const {design} = input
  return [
    `Build the page from the nodes, desktop first at ${design.viewport.width} wide.`,
    OUTLINE,
    NODE_FIELDS,
    ...RULES,
    ...(input.implied ? [IMPLIED_FIELDS] : []),
    ...(design.source.kind === 'figma' ? [REFLOW_FIELDS] : []),
  ]
}

function tagged(input: {
  node: DesignNode
  parent: DesignNode | null
  depth: number
  keys: Map<string, string>
}): Tagged {
  const {node, parent, depth} = input
  const facts = node.figma
  const key = input.keys.get(node.id)
  return {
    id: node.id,
    type: facts?.type ?? node.kind.toUpperCase(),
    name: facts?.name ?? (node.kind === 'text' ? node.text : ''),
    within: parent?.id ?? null,
    depth,
    box: facts?.box ?? node.box,
    ...facts?.fields,
    ...(facts?.absolute === true ? {absolute: true} : {}),
    ...(node.implied === true ? {implied: true} : {}),
    ...(node.reflow === undefined ? {} : {reflow: shownReflow(node.reflow)}),
    ...(key === undefined ? {} : {selector: key}),
    ...(facts === undefined && node.kind === 'text' ? {text: node.text} : {}),
  }
}

function shownReflow(reflow: NonNullable<DesignNode['reflow']>): NonNullable<Tagged['reflow']> {
  return {kind: reflow.kind, ...(reflow.minChildWidth === undefined ? {} : {minChildWidth: reflow.minChildWidth})}
}

function outlined(input: {tagged: Tagged; node: DesignNode}): Tagged {
  const kept = Object.fromEntries(Object.entries(input.tagged).filter(([key]) => OUTLINE_KEYS.includes(key)))
  const {id, type, name, within, depth, box} = input.tagged
  return {...kept, id, type, name, within, depth, box, descendants: [...walk(input.node)].length - 1}
}

function ancestorsOf(input: {id: string; parents: Map<string, DesignNode | null>}): {id: string; name: string}[] {
  const parent = input.parents.get(input.id) ?? null
  if (parent === null) return []
  return [...ancestorsOf({...input, id: parent.id}), {id: parent.id, name: parent.figma?.name ?? ''}]
}
