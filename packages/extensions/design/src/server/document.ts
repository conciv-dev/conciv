import {toolError} from '@conciv/extension'
import {DOMParser} from 'linkedom'
import {z} from 'zod'
import type {DesignNode, Design, Got, IdTree} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {readIds} from '../shared/id-tree.js'

export function documentOf(input: {target: string; design: Design; ids: IdTree | null; selector?: string}): Got {
  const {design} = input
  const reads = input.ids === null ? null : readIds({root: input.ids.root, live: null})
  const keys = new Map(
    [...walk(design.root)].flatMap(({node}) => {
      const selector = reads?.named(node.id).selector ?? null
      return selector === null ? [] : [[node.id, selector] as const]
    }),
  )
  const steps = [...walk(design.root)]
  const count = steps.filter(({node}) => node.implied !== true).length
  const markup = emptyMarkup()
  const head = markup.documentElement
  attributed({
    element: head,
    attributes: [
      ['viewport', `${design.viewport.width} ${design.viewport.height}`],
      ['count', `${count}`],
    ],
  })
  head.append(elementOf({markup, node: design.root, keys}))
  if (input.selector !== undefined) return {target: input.target, matches: selected({head, selector: input.selector})}
  const document = head.outerHTML
  const bytes = new TextEncoder().encode(document).length
  return {
    target: input.target,
    viewport: design.viewport,
    count,
    bytes,
    rules: rulesFor({design, bytes, implied: steps.some(({node}) => node.implied === true)}),
    document,
  }
}

type Markup = ReturnType<typeof emptyMarkup>

type Element = ReturnType<Markup['createElement']>

type Attribute = readonly [string, string]

type Pair = readonly [string, string | undefined]

const DOCUMENT_TAG = 'design'

const PaintSchema = z.object({
  type: z.string(),
  color: z.string().optional(),
  opacity: z.number().optional(),
  stops: z.array(z.object({color: z.string(), opacity: z.number(), at: z.number()})).optional(),
})

const FieldsSchema = z.strictObject({
  fills: z.array(PaintSchema).optional(),
  strokes: z.array(PaintSchema).optional(),
  strokeWeight: z.number().optional(),
  radius: z.union([z.number(), z.array(z.number())]).optional(),
  text: z.string().optional(),
  font: z
    .strictObject({
      family: z.string().optional(),
      size: z.number().optional(),
      weight: z.number().optional(),
      style: z.string().optional(),
      lineHeight: z.object({unit: z.string(), value: z.number()}).optional(),
      letterSpacing: z.object({unit: z.string(), value: z.number()}).optional(),
      align: z.string().optional(),
      case: z.string().optional(),
      decoration: z.string().optional(),
    })
    .optional(),
  layout: z
    .strictObject({
      mode: z.string(),
      gap: z.union([z.number(), z.string()]).optional(),
      pad: z.array(z.number()).optional(),
      wrap: z.string().optional(),
      primaryAlign: z.string().optional(),
      counterAlign: z.string().optional(),
      primarySizing: z.string().optional(),
      counterSizing: z.string().optional(),
    })
    .optional(),
  sizing: z.object({h: z.string().optional(), v: z.string().optional()}).optional(),
  limits: z.object({minW: z.number().nullable(), maxW: z.number().nullable()}).optional(),
  layoutAlign: z.string().optional(),
  constraints: z.object({horizontal: z.string(), vertical: z.string()}).optional(),
  clips: z.boolean().optional(),
  grow: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  image: z.boolean().optional(),
  crop: z.boolean().optional(),
})

type Fields = z.output<typeof FieldsSchema>

type Paint = z.output<typeof PaintSchema>

const DIRECTIONS = new Map([
  ['HORIZONTAL', 'row'],
  ['VERTICAL', 'column'],
  ['GRID', 'grid'],
])

const DEFAULT_WRAP = 'NO_WRAP'

function markupRule(size: string): string {
  return `design_get returns the whole design as markup, about ${size}; call it with a CSS selector such as [id="1:371"] or text to receive only the matching parts.`
}

const NODE_FIELDS =
  'Every element is one node and its tag is the node type; its attributes are what the node has: id, name, box (x y w h, absolute), layout (direction, gap-, pad- top right bottom left, main- and cross- alignment and sizing, wrap), fill, stroke, radius, font (family weight size/line), color for text, and the other auto-layout fields; the text of a text node is the element text.'

const RULES = [
  'The dev server stamps data-conciv-key attributes into your JSX as you save; keep them, never strip or rewrite them, and edit around them.',
  'Lay the page out with normal flow, flex and grid: no position absolute, no px width or height on containers or text; sizes come from content, gaps and flex/grid rules, percentages and ratios, so the page stays a page and reflows at other widths.',
  'Every element with the image attribute is an empty div with no background, border or fill, never a drawn svg, data url or CSS shape.',
  'Every image div gets its size from an aspect-ratio and a percentage width or flex-basis, never px.',
  'A node without the image attribute is a box: when it has a solid fill, that fill is its background, whether it is an icon, a logo, a dot or a drawing.',
  'A row whose layout says wrap keeps all its children on one line at the design width, exactly as the Figma frame shows them; it may wrap only when the viewport is narrower than the row is in the design, never at the design width.',
  'design_check returns the rows to fix and the verdict: a row without a width is about the page at the design width; a row with a width is about the page measured at that width, mostly narrower: it did not reflow as tagged, sticks out, overlaps a sibling or scrolls sideways.',
]

const IMPLIED_FIELDS =
  'elements with the implied attribute are groups the design file does not have but its layout implies (a row or column of the siblings inside); build them as containers with their layout; a gap attribute on one says its gap in words.'

const REFLOW_FIELDS =
  'reflow on a node: "kind minChildWidth", kind is stack, wrap or scroll. While the viewport lets every child keep at least minChildWidth px, the node lays out as the boxes say. Once a child would have to go narrower than that: stack means its children go one under another (a column); wrap means its children wrap onto more lines; scroll means the node scrolls horizontally inside its own box instead of wrapping. Nothing may ever run outside the node.'

function rulesFor(input: {design: Design; bytes: number; implied: boolean}): string[] {
  const {design} = input
  const size = new Intl.NumberFormat('en', {notation: 'compact', style: 'unit', unit: 'byte', unitDisplay: 'narrow'})
  return [
    `Build the page from the nodes, desktop first at ${design.viewport.width} wide.`,
    markupRule(size.format(input.bytes)),
    NODE_FIELDS,
    ...RULES,
    ...(input.implied ? [IMPLIED_FIELDS] : []),
    ...(design.source.kind === 'figma' ? [REFLOW_FIELDS] : []),
  ]
}

function selected(input: {head: Element; selector: string}): {path: {id: string; name: string}[]; document: string}[] {
  const found = matched(input)
  if (found.length > 0) return found.map((element) => ({path: pathOf(element), document: element.outerHTML}))
  const total = input.head.querySelectorAll('*').length
  throw toolError('selector', {
    message: `the selector ${input.selector} matches none of the ${total} elements of the design`,
  })
}

function matched(input: {head: Element; selector: string}): Element[] {
  try {
    return [...input.head.querySelectorAll(input.selector)]
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error)
    throw toolError('selector', {message: `the selector ${input.selector} does not parse: ${said}`})
  }
}

function pathOf(element: Element): {id: string; name: string}[] {
  const parent = element.parentElement
  if (parent === null || !parent.hasAttribute('id')) return []
  return [...pathOf(parent), {id: parent.getAttribute('id') ?? '', name: parent.getAttribute('name') ?? ''}]
}

function emptyMarkup() {
  return new DOMParser().parseFromString(`<${DOCUMENT_TAG}/>`, 'text/xml')
}

function elementOf(input: {markup: Markup; node: DesignNode; keys: Map<string, string>}): Element {
  const {markup, node} = input
  const element = markup.createElement(tagOf(node))
  const fields = FieldsSchema.parse(node.figma?.fields ?? {})
  attributed({element, attributes: attributesOf({node, fields, key: input.keys.get(node.id)})})
  const text = textOf({node, fields})
  if (text !== null) element.textContent = text
  node.children.forEach((child) => element.append(elementOf({...input, node: child})))
  return element
}

function attributed(input: {element: Element; attributes: Attribute[]}): void {
  input.attributes.toReversed().forEach(([name, value]) => input.element.setAttribute(name, value))
}

function tagOf(node: DesignNode): string {
  return (node.figma?.type ?? node.kind).toLowerCase()
}

function textOf(input: {node: DesignNode; fields: Fields}): string | null {
  const {node} = input
  if (input.fields.text !== undefined) return input.fields.text
  return node.figma === undefined && node.kind === 'text' ? node.text : null
}

function attributesOf(input: {node: DesignNode; fields: Fields; key: string | undefined}): Attribute[] {
  const {node, key, fields} = input
  const facts = node.figma
  const name = facts?.name ?? (node.kind === 'text' ? node.text : '')
  const box = facts?.box ?? node.box
  const text = node.figma?.type === 'TEXT' || (facts === undefined && node.kind === 'text')
  const pairs: Pair[] = [
    ['id', node.id],
    ['name', name === '' ? undefined : name],
    ['box', [box.x, box.y, box.w, box.h].join(' ')],
    ['layout', fields.layout === undefined ? undefined : layoutOf(fields.layout)],
    ['gap', gapWords(fields.layout?.gap)],
    [text ? 'color' : 'fill', paintsOf(fields.fills)],
    ['stroke', paintsOf(fields.strokes)],
    ['stroke-weight', numberOf(fields.strokeWeight)],
    ['radius', fields.radius === undefined ? undefined : [fields.radius].flat().join(' ')],
    ...fontOf(fields.font),
    ['sizing', wordsOf([prefixed('h', fields.sizing?.h), prefixed('v', fields.sizing?.v)])],
    ['limits', wordsOf([limitOf('min-w', fields.limits?.minW), limitOf('max-w', fields.limits?.maxW)])],
    ['align-self', fields.layoutAlign?.toLowerCase()],
    [
      'constraints',
      wordsOf([prefixed('h', fields.constraints?.horizontal), prefixed('v', fields.constraints?.vertical)]),
    ],
    ['grow', numberOf(fields.grow)],
    ['rotation', numberOf(fields.rotation)],
    ['opacity', numberOf(fields.opacity)],
    [
      'reflow',
      node.reflow === undefined ? undefined : wordsOf([node.reflow.kind, numberOf(node.reflow.minChildWidth)]),
    ],
    ...flags([
      ['clips', fields.clips === true],
      ['image', fields.image === true],
      ['crop', fields.crop === true],
      ['absolute', facts?.absolute === true],
      ['implied', node.implied === true],
    ]),
    ['key', key],
  ]
  return pairs.flatMap(([attribute, value]) => (value === undefined ? [] : [[attribute, value] as const]))
}

function layoutOf(layout: NonNullable<Fields['layout']>): string {
  return (
    wordsOf([
      DIRECTIONS.get(layout.mode) ?? layout.mode.toLowerCase(),
      gapToken(layout.gap),
      padOf(layout.pad ?? []),
      prefixed('main', layout.primaryAlign),
      prefixed('cross', layout.counterAlign),
      prefixed('main-size', layout.primarySizing),
      prefixed('cross-size', layout.counterSizing),
      layout.wrap === undefined || layout.wrap === DEFAULT_WRAP ? undefined : 'wrap',
    ]) ?? ''
  )
}

function gapToken(gap: number | string | undefined): string | undefined {
  if (gap === undefined || gap === '' || gapWords(gap) !== undefined) return undefined
  return `gap-${gap}`
}

function gapWords(gap: number | string | undefined): string | undefined {
  if (typeof gap !== 'string' || gap === '' || Number.isFinite(Number(gap))) return undefined
  return gap
}

function padOf(pad: number[]): string | undefined {
  const [top, right, bottom, left] = pad
  if (pad.every((side) => side === 0)) return undefined
  if (top === bottom && right === left) return top === right ? `pad-${top}` : `pad-${top}-${right}`
  return `pad-${[top, right, bottom, left].join('-')}`
}

function fontOf(font: Fields['font']): Pair[] {
  if (font === undefined) return []
  const line = font.lineHeight === undefined ? '' : `/${font.lineHeight.value}`
  return [
    [
      'font',
      wordsOf([font.family, numberOf(font.weight), font.size === undefined ? undefined : `${font.size}${line}`]),
    ],
    ['font-style', font.style],
    ['tracking', numberOf(font.letterSpacing?.value)],
    ['text-align', font.align?.toLowerCase()],
    ['text-case', font.case?.toLowerCase()],
    ['decoration', font.decoration?.toLowerCase()],
  ]
}

function paintsOf(paints: Paint[] | undefined): string | undefined {
  if (paints === undefined || paints.length === 0) return undefined
  return paints.map(paintOf).join(', ')
}

function paintOf(paint: Paint): string {
  if (paint.stops !== undefined)
    return wordsOf([paint.type, ...paint.stops.map((stop) => `${colorOf(stop)} ${stop.at}%`)]) ?? paint.type
  if (paint.color === undefined) return paint.type
  return colorOf({color: paint.color, opacity: paint.opacity})
}

function colorOf(input: {color: string; opacity: number | undefined}): string {
  return input.opacity === undefined || input.opacity === 1 ? input.color : `${input.color}/${input.opacity}`
}

function prefixed(prefix: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${prefix}-${value.toLowerCase().replaceAll('_', '-')}`
}

function limitOf(prefix: string, value: number | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : `${prefix}-${value}`
}

function numberOf(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value}`
}

function wordsOf(words: (string | undefined)[]): string | undefined {
  const kept = words.filter((word) => word !== undefined)
  return kept.length === 0 ? undefined : kept.join(' ')
}

function flags(list: (readonly [string, boolean])[]): Attribute[] {
  return list.flatMap(([name, on]) => (on ? [[name, ''] as const] : []))
}
