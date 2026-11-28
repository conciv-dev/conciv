import {z} from 'zod'
import type {Design, DesignNode, Reflow} from '../model/design.js'
import {walk} from '../model/tree.js'
import type {Got, TaggedNode} from './get-schema.js'

export function renderDocument(input: {target: string; design: Design}): Got {
  const {design} = input
  const nodes = [...walk(design.root)].map(({node, parent, depth}) => tagged({node, parent, depth}))
  return {
    target: input.target,
    root: design.root.id,
    count: nodes.filter((node) => node.implied !== true).length,
    viewport: design.viewport,
    rules: designRules({design, implied: nodes.some((node) => node.implied === true)}),
    nodes,
  }
}

export function variantRule(input: {design: Got; widths: number[]}): string {
  const others = input.widths.filter((width) => width !== input.design.viewport.width).join(' and ')
  return `This frame is the page at ${input.design.viewport.width} wide; the other variants are the same page at ${others} wide. Build one page, one set of elements, that matches each frame at its width, with media or container queries between them.`
}

const INTRINSIC = 'INTRINSIC'
const LineHeightSchema = z.object({value: z.number(), unit: z.string().default('PIXELS')})
const LaidFontSchema = z.looseObject({lineHeight: LineHeightSchema.optional(), trim: z.string().optional()})

const NODE_FIELDS =
  'Every node has its id, type, name, within (the node it sits in), absolute box, fills, strokes, text, font (font.lineHeight.value is the line height in px Figma lays the text out at, absent when leading trim, font.trim, cuts an auto line to its glyphs) and auto-layout fields, tokens: the design variables its fields are bound to, and asset: the file to show for an image or vector node, or the finished background of a frame that has children, its fill layers already flattened into it (assetLayers lists them).'

const RULES = [
  'The dev server keys the elements it serves with data-conciv-key; the keys are not in your files, and an element keeps its key while you edit it.',
  'Lay the page out with normal flow, flex and grid: no position absolute, no px width or height on containers or text; sizes come from content, gaps and flex/grid rules, percentages and ratios, so the page stays a page and reflows at other widths.',
  'A node with asset and no children renders that file (an <img src> for a png, an inline svg or an <img> for an svg) sized by its box ratio, and draws nothing else; never a data url, emoji or CSS shape.',
  'A node with asset and children (image: true) is a box whose background-image is that file, background-size cover, with its children inside it; the file is the complete look of the box, so add no filter, blend mode, overlay or tint of your own.',
  'Every asset element gets its size from an aspect-ratio and a percentage width or flex-basis, never px.',
  'A control the design draws works as that control: a slider drags and takes arrow keys, a menu button opens a menu, a toggle or checkbox switches, a field takes typing. Build it from its nodes as elements (an asset handle is the <img> inside the handle element), never as one picture, and add the behaviour even though the design shows one state.',
  'A node not marked image is a box: when it has a solid fill, that fill is its background, whether it is an icon, a logo, a dot or a drawing.',
  'A frame or shape stroke takes no space in Figma: strokeAlign INSIDE draws it over the edge of the box, CENTER half over it and OUTSIDE just outside it, and the box, padding and gaps do not count it. Draw it as an outline of strokeWeight px in the stroke color with outline-offset minus strokeWeight for INSIDE, minus half of it for CENTER and 0 for OUTSIDE, never as a border, so the box, padding and gaps stay exactly as the design says. A node with individualStrokeWeights strokes only the sides above 0: draw just those sides with a box-shadow per side, inset for INSIDE (inset 0 -1px 0 0 for a 1px bottom) and outset for OUTSIDE (0 1px 0 0 for a 1px bottom). design_check reads a border, an outline or a box-shadow with no blur as the stroke, on the sides each draws.',
  'A node with effects draws each one: an inner-shadow as an inset box-shadow and a drop-shadow as a box-shadow (a text-shadow on text) with the same x, y, blur, spread, color and opacity in px, a layer-blur as filter: blur() and a background-blur as backdrop-filter: blur().',
  'A row whose auto-layout says wrap: WRAP keeps all its children on one line at the design width, exactly as the Figma frame shows them; it may wrap only when the viewport is narrower than the row is in the design, never at the design width.',
  'design_check returns the rows to fix and the verdict: a row without a width is about the page at the design width; a row with a width is about the page measured at that width, mostly narrower: it did not reflow as tagged, sticks out, overlaps a sibling or scrolls sideways.',
  'A token-drift row is a flag, not a row to fix: the component uses a kit token whose value the design variable disagrees with. Never edit the element to clear it; change the token in the kit or the variable in the design, or report the drift.',
  'A component row is cleared by rendering the node with the component it names: import it as the row says and render it there instead of the hand-drawn element.',
  'A component row that says a node was rendered by a component means the page had that component before your edit: render the node with it again, never drop, rename or redraw the component to clear the row.',
]

const IMPLIED_FIELDS =
  'nodes with implied: true are groups the design file does not have but its layout implies (a row or column of the siblings inside); build them as containers with their layout.'

const REFLOW_FIELDS =
  'reflow on a node: {kind: stack | wrap | scroll, minChildWidth}. While the viewport lets every child keep at least minChildWidth px, the node lays out as the boxes say. Once a child would have to go narrower than that: stack means its children go one under another (a column); wrap means its children wrap onto more lines; scroll means the node scrolls horizontally inside its own box instead of wrapping. Nothing may ever run outside the node.'

function designRules(input: {design: Design; implied: boolean}): string[] {
  return [
    `Build the page from the nodes, desktop first at ${input.design.viewport.width} wide.`,
    NODE_FIELDS,
    ...RULES,
    ...(input.implied ? [IMPLIED_FIELDS] : []),
    REFLOW_FIELDS,
  ]
}

function tagged(input: {node: DesignNode; parent: DesignNode | null; depth: number}): TaggedNode {
  const {node, parent, depth} = input
  const named = namedFields(node)
  return {
    id: node.id,
    type: named.type,
    name: named.name,
    within: parent?.id ?? null,
    depth,
    box: named.box,
    ...laidFields(node.figma?.fields),
    ...markedFields(node),
  }
}

function namedFields(node: DesignNode): Pick<TaggedNode, 'type' | 'name' | 'box'> {
  const facts = node.figma
  if (facts !== undefined) return {type: facts.type, name: facts.name, box: facts.box}
  return {type: node.kind.toUpperCase(), name: node.kind === 'text' ? node.text : '', box: node.box}
}

function markedFields(node: DesignNode): Record<string, unknown> {
  return {
    ...(node.figma?.absolute === true ? {absolute: true} : {}),
    ...(node.implied === true ? {implied: true} : {}),
    ...(node.reflow === undefined ? {} : {reflow: shownReflow(node.reflow)}),
    ...(node.figma === undefined && node.kind === 'text' ? {text: node.text} : {}),
  }
}

function shownReflow(reflow: Reflow): Reflow {
  return {kind: reflow.kind, ...(reflow.minChildWidth === undefined ? {} : {minChildWidth: reflow.minChildWidth})}
}

function laidFields(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (fields === undefined) return {}
  const font = LaidFontSchema.safeParse(fields.font)
  if (!font.success || font.data.lineHeight === undefined) return fields
  const {lineHeight, ...rest} = font.data
  const trimmed = lineHeight.unit.startsWith(INTRINSIC) && font.data.trim !== undefined
  if (trimmed) return {...fields, font: rest}
  const value = lineHeight.unit.startsWith(INTRINSIC) ? Math.round(lineHeight.value) : lineHeight.value
  return {...fields, font: {...rest, lineHeight: {...lineHeight, value}}}
}
