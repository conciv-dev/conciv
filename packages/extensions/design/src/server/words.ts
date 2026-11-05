import {uniq} from 'es-toolkit'
import {
  STAGES,
  type Changes,
  type ContainerLayout,
  type Design,
  type DesignNode,
  type Stage,
  type Words,
} from '../shared/defs.js'
import {
  deltaSentence,
  designFamilies,
  glyphRun,
  iconSized,
  PLACEHOLDER_ATTR,
  setVia,
  TOLERANCES,
  traced,
} from '../shared/tolerances.js'
import type {Box, Delta, DesignTree, Element, Framework, Item, Unmatched} from '../shared/types.js'
import {union} from '../shared/box.js'
import {childrenIn, descendantsIn, placement, walk} from '../shared/tree.js'

export const WORDS: Words = {
  outline: designOutline,
  placeholder: placeholderSource,
  line: nodeLine,
  delta: ({element, delta}) =>
    `${componentLabel({tag: element.live.tag, source: element.live.source})}: ${pairSentence({delta, element})}`,
  entry: entrySentence,
  row: runSentence,
  subject: changeSubject,
  change: changeLine,
  stalled: stalledLine,
  flipped: flippedLine,
  painted: paintedLine,
  warning: warningSentence,
}

type TextDesign = Extract<DesignNode, {kind: 'text'}>
type LayoutRun = ContainerLayout['runs'][number]

function changeLine(input: {changes: Changes; round: number; similarity: {now: number; was: number} | null}): string {
  const {changes, round, similarity} = input
  const [first] = changes.regressed
  const parts = [
    changes.done.length === 0 ? null : `${changes.done.length} done`,
    first === undefined ? null : `${changes.regressed.length} regressed (${clipped(first.sentence)})`,
    changes.paired.length === 0 ? null : `${changes.paired.length} paired`,
    changes.lost.length === 0 ? null : `${changes.lost.length} lost`,
    changes.moved.length === 0 ? null : `${changes.moved.length} moved`,
  ].filter((part) => part !== null)
  const trend =
    similarity === null ? '' : `, similarity ${similarity.now.toFixed(2)} (was ${similarity.was.toFixed(2)})`
  return `since round ${round}: ${parts.length === 0 ? 'no node changed' : parts.join(', ')}${trend}`
}

function componentLabel(input: {tag: string; source: {file: string; line: number} | null | undefined}): string {
  const {tag, source} = input
  if (source === null || source === undefined) return tag
  return `${tag} (${source.file}:${source.line})`
}

function pairSentence(input: {delta: Delta; element: Element}): string {
  const {delta, element} = input
  if (delta.kind === 'fontSize') {
    const text = element.texts.find((candidate) => candidate.typography !== undefined)
    const lines =
      text?.typography === undefined || text.lines.length < 2
        ? ''
        : ` (${text.lines.length} lines of ${Math.round(text.typography.lineHeight)} px)`
    return deltaSentence({...delta, target: `${delta.target}${lines}`})
  }
  if (delta.kind === 'lines') {
    const width = Math.round(element.targetBox.w)
    const count = delta.live === 1 ? '1 line' : `${delta.live} lines`
    return `wraps to ${count} where the design has ${delta.target}; the design's text box is ${width} px wide${setVia(delta)}`
  }
  if (delta.kind !== 'sizing') return deltaSentence(delta)
  const width = Math.round(element.liveBox.w)
  const declared = traced(delta) && delta.declaration !== undefined ? `, declared as \`${delta.declaration}\`` : ''
  const where = delta.file === undefined ? '' : ` at ${delta.file}${delta.line === undefined ? '' : `:${delta.line}`}`
  const rule = delta.target === 'fill' ? 'fill the row (flex: 1)' : 'fit its content'
  return `let the ${element.live.tag} ${rule}; it is sized ${width} px${declared}${where}`
}

function entrySentence(input: {entry: Unmatched; tree: DesignTree; unbuilt: Record<string, Unmatched>}): string {
  const {entry, tree, unbuilt} = input
  switch (entry.kind) {
    case 'unbuilt':
      return unbuiltSentence({entry, tree, unbuilt})
    case 'extra':
      return `${componentLabel({tag: 'the element', source: entry.source})} renders${entry.live === undefined ? '' : ` at ${Math.round(entry.live.x)},${Math.round(entry.live.y)} (${Math.round(entry.live.w)}×${Math.round(entry.live.h)})`} where the design shows nothing; remove it or match the design`
    case 'offset': {
      const shift = entry.shift ?? {dx: 0, dy: 0}
      if (entry.live === undefined) {
        return `move the page content by ${shift.dx},${shift.dy} px to where the design places it`
      }
      const x = Math.round(entry.live.x)
      const y = Math.round(entry.live.y)
      const what = componentLabel({tag: 'the element', source: entry.source})
      return `move ${what} to ${x + shift.dx},${y + shift.dy} (now at ${x},${y})`
    }
  }
}

function unbuiltSentence(input: {entry: Unmatched; tree: DesignTree; unbuilt: Record<string, Unmatched>}): string {
  const {entry, tree, unbuilt} = input
  const node = tree.nodes.find((candidate) => candidate.id === entry.node)
  if (node === undefined) return `build the ${entry.label ?? 'element'} the design shows`
  const children = childrenIn({tree, id: node.id})
  if (children.length === 0) return leafSentence({node, tree})
  const layout = node.layout
  const props = properties({layout, children})
  if (allUnbuilt({tree, id: node.id, unbuilt}) && loneText(children) === null) {
    const listed = children.slice(0, LISTED).map((child) => childPhrase({node: child, tree}))
    const more = children.length > LISTED ? [`and ${children.length - LISTED} more`] : []
    const tail = props.length === 0 ? '' : `; ${props.join(', ')}`
    return `build ${containerName({node, tree, withCount: false})}${placePhrase({node, tree})}: ${[...listed, ...more].join(', ')}${tail}`
  }
  const tail = props.length === 0 ? '' : `: ${props.join(', ')}`
  return `build ${containerName({node, tree, withCount: true})}${placePhrase({node, tree})}${tail}`
}

function leafSentence(input: {node: DesignNode; tree: DesignTree}): string {
  const {node, tree} = input
  const seat = placement({node, tree})
  const size =
    node.kind === 'box'
      ? ` ${Math.round(node.box.w)}x${Math.round(node.box.h)}${node.paint === undefined ? '' : ` ${node.paint.background}`}`
      : node.layout === undefined
        ? ''
        : ` (${node.layout.size})`
  const subject = named({node, tree}) ? label({node, tree}) : article(node)
  if (seat === null) return `build ${subject}${size}`
  if (seat.index > TOLERANCES.ordinalLimit) {
    return `build ${subject}${size}${anchorPhrase({box: node.box, tree, word: 'near'})}`
  }
  const where =
    seat.parent !== null && named({node: seat.parent, tree})
      ? ` inside ${label({node: seat.parent, tree})}`
      : anchorPhrase({box: node.box, tree, word: 'under'})
  return `build ${subject}${size} as the ${ordinal(seat.index)} item in the ${seat.direction}${where}`
}

function runSentence(input: {run: LayoutRun; members: DesignNode[]; tree: DesignTree}): string {
  const {run, members, tree} = input
  const [first] = members
  const box = members.length === 0 ? undefined : union(members.map((member) => member.box))
  const where = first === undefined ? '' : placePhrase({node: first, tree, box})
  const props = properties({layout: {gap: run.gap, align: run.align}, children: members})
  const holds = members.slice(0, TOLERANCES.ordinalLimit).flatMap((member, position) => {
    const texts = textsIn({tree, node: member}).slice(0, LISTED)
    return texts.length === 0 ? [] : [`${ordinal(position + 1)}: ${texts.map(quoted).join(', ')}`]
  })
  const contents = holds.length === 0 ? '' : `; ${holds.join('; ')}`
  return `build a row of ${countPhrase({nodes: members, tree})}${where}: ${props.join(', ')}${contents}`
}

function properties(input: {layout: Partial<ContainerLayout> | undefined; children: DesignNode[]}): string[] {
  const {layout, children} = input
  if (layout === undefined) return []
  return [
    ...(children.length > 1 && children.every((child) => child.layout?.size === 'fill') ? ['equal width'] : []),
    ...(layout.gap === undefined || children.length < 2
      ? []
      : [layout.gap.uniform ? `gap ${layout.gap.px}` : `gaps around ${layout.gap.px}`]),
    ...(layout.align === undefined ? [] : [`align ${layout.align}`]),
    ...(layout.wrap === true ? ['wrapping'] : []),
    ...paddingPhrase(layout.padding),
  ]
}

function paddingPhrase(padding: ContainerLayout['padding'] | undefined): string[] {
  const sides = padding === undefined ? [] : paddingSides(padding)
  return sides.every((side) => side === 0) ? [] : [`padding ${sides.join(' ')}`]
}

function containerName(input: {node: DesignNode; tree: DesignTree; withCount: boolean}): string {
  const {node, tree} = input
  const children = childrenIn({tree, id: node.id})
  const direction = node.layout?.direction ?? 'stack'
  const only = loneText(children)
  if (only !== null) return `a box with ${quoted(only.text)}`
  if (!input.withCount) return `a ${direction}`
  return `a ${direction} of ${countPhrase({nodes: children, tree})}`
}

function childPhrase(input: {node: DesignNode; tree: DesignTree}): string {
  const {node, tree} = input
  const size = node.layout === undefined ? '' : ` (${node.layout.size})`
  if (node.kind === 'text') return `${quoted(node.text)}${size}`
  if (node.kind === 'image') return `an image${size}`
  const children = childrenIn({tree, id: node.id})
  if (children.length === 0) return `a box${size}`
  const name = containerName({node, tree, withCount: true})
  const gap = node.layout?.gap
  if (children.length === 1 || gap === undefined) return `${name}${size}`
  return `${name} (gap ${gap.px})`
}

function placePhrase(input: {node: DesignNode; tree: DesignTree; box?: Box | undefined}): string {
  const {node, tree} = input
  const seat = placement({node, tree})
  if (seat === null) return ''
  const index = node.layout?.index ?? 0
  const previous = childrenIn({tree, id: seat.parent?.id}).find((sibling) => sibling.layout?.index === index - 1)
  if (previous !== undefined && named({node: previous, tree})) {
    const direction = (seat.parent === null ? tree.root.layout : seat.parent.layout)?.direction
    return ` ${direction === 'row' || direction === 'grid' ? 'after' : 'under'} ${label({node: previous, tree})}`
  }
  if (previous === undefined && seat.parent === null) return ' at the top of the page'
  if (previous === undefined && seat.parent !== null && named({node: seat.parent, tree})) {
    return ` inside ${label({node: seat.parent, tree})}`
  }
  return anchorPhrase({box: input.box ?? node.box, tree, word: 'under'})
}

function anchorPhrase(input: {box: Box; tree: DesignTree; word: 'under' | 'near'}): string {
  const {box, tree, word} = input
  const [nearest] = tree.nodes
    .flatMap((node) => (node.kind === 'text' && above({text: node, box}) ? [node] : []))
    .toSorted((a, b) => box.y - a.box.y - (box.y - b.box.y))
  if (nearest === undefined) return ' at the top of the page'
  return ` ${word} ${quoted(clipped(nearest.text))}`
}

function above(input: {text: TextDesign; box: Box}): boolean {
  const {text, box} = input
  const overlaps = text.box.x < box.x + box.w && text.box.x + text.box.w > box.x
  return overlaps && text.box.y < box.y && !glyphRun(text) && text.text.trim() !== ''
}

function clipped(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= ANCHOR_LENGTH ? trimmed : `${trimmed.slice(0, ANCHOR_LENGTH).trimEnd()}…`
}

function named(input: {node: DesignNode; tree: DesignTree}): boolean {
  const {node, tree} = input
  if (node.kind === 'text') return true
  if (node.kind === 'image') return false
  return textsIn({tree, node}).length > 0
}

function article(node: DesignNode): string {
  return node.kind === 'image' ? 'an image' : 'a box'
}

function label(input: {node: DesignNode; tree: DesignTree}): string {
  const {node, tree} = input
  if (node.kind === 'text') return `the text ${quoted(node.text)}`
  if (node.kind === 'image') return 'the image'
  const [text] = textsIn({tree, node})
  return text === undefined ? 'the box' : `the box with ${quoted(text)}`
}

function countPhrase(input: {nodes: DesignNode[]; tree: DesignTree}): string {
  const {nodes, tree} = input
  const nouns = uniq(
    nodes.map((node) => {
      if (node.kind === 'text') return NOUNS.text
      if (node.kind === 'image') return NOUNS.image
      const children = childrenIn({tree, id: node.id})
      return children.length === 0 || loneText(children) !== null ? NOUNS.box : NOUNS.card
    }),
  )
  const [only] = nouns
  if (nouns.length !== 1 || only === undefined) return `${nodes.length} items`
  return nodes.length === 1 ? `1 ${only[0]}` : `${nodes.length} ${only[1]}`
}

function loneText(children: DesignNode[]): TextDesign | null {
  const [only] = children
  return children.length === 1 && only?.kind === 'text' ? only : null
}

function textsIn(input: {tree: DesignTree; node: DesignNode}): string[] {
  return descendantsIn({tree: input.tree, id: input.node.id}).flatMap((node) =>
    node.kind === 'text' ? [node.text] : [],
  )
}

function quoted(text: string): string {
  return `"${text}"`
}

function ordinal(index: number): string {
  const teen = index % 100 >= 11 && index % 100 <= 13
  const suffix = teen ? 'th' : (ORDINAL_SUFFIXES[index % 10] ?? 'th')
  return `${index}${suffix}`
}

function allUnbuilt(input: {tree: DesignTree; id: string; unbuilt: Record<string, Unmatched>}): boolean {
  const children = childrenIn({tree: input.tree, id: input.id})
  return children.length > 0 && children.every((child) => child.id in input.unbuilt)
}

function paintedLine(count: number): string {
  return `painted: ${count} elements are absolutely positioned; lay the page out with flow, flex or grid and let the browser place them`
}

function stalledLine(input: {stage: Stage; score: number[]; unchanged: Item[]}): string {
  const {stage, score, unchanged} = input
  const total = score[1 + STAGES.indexOf(stage)] ?? 0
  const head = `stalled: the ${stage} total held at ${total} for ${TOLERANCES.stallRounds} rounds`
  if (unchanged.length === 0) return head
  return `${head}; ${unchanged.length} items unchanged, first: ${unchanged
    .slice(0, STALLED_NAMED)
    .map((item) => item.sentence)
    .join('; ')}`
}

function changeSubject(input: {node: DesignNode; tree: DesignTree}): string {
  const {node, tree} = input
  if (named({node, tree})) return label({node, tree})
  return `${article(node)}${anchorPhrase({box: node.box, tree, word: 'under'})}`
}

function warningSentence(delta: Delta): string {
  if (delta.warning === 'svg-drawn') {
    const what = componentLabel({
      tag: delta.selector ?? 'the element',
      source: delta.file === undefined ? null : {file: delta.file, line: delta.line ?? 0},
    })
    return `${what}: ${delta.live}; replace it with ${delta.target}`
  }
  const where = delta.file === undefined ? '' : ` at ${delta.file}${delta.line === undefined ? '' : `:${delta.line}`}`
  return `replace the hard-coded sample "${delta.live}"${where} with the expression that renders it`
}

function flippedLine(input: {items: Item[]; round: number}): string {
  const {items, round} = input
  const head =
    items.length === 1
      ? `1 item moved back to its round-${round} value`
      : `${items.length} items moved back to their round-${round} values`
  return `${head}: ${items
    .slice(0, FLIPPED_NAMED)
    .map((item) => item.sentence)
    .join('; ')}`
}

function designOutline(design: Design): string[] {
  const {scale, root} = design
  const page = `page ${sized({box: root.box, scale})}${layoutPhrase(root.layout)}`
  const families = designFamilies([...walk({root})].map(({node}) => node))
  const fonts = families.length === 0 ? [] : [`fonts: ${families.join(', ')}`]
  return [page, ...fonts, ...outlineLines({children: root.children, depth: SECTION_DEPTH, scale})]
}

function outlineLines(input: {children: DesignNode[]; depth: number; scale: number}): string[] {
  const {depth, scale} = input
  return input.children
    .toSorted((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.id.localeCompare(b.id))
    .flatMap((node) => [
      `${INDENT.repeat(depth)}${depth === SECTION_DEPTH ? `section ${node.id} ` : ''}${nodeLine({node, scale})}`,
      ...outlineLines({children: node.children, depth: depth + 1, scale}),
    ])
}

function nodeLine(input: {node: DesignNode; scale: number}): string {
  const {node, scale} = input
  if (node.kind === 'image')
    return `${iconSized(node.box) ? 'icon' : 'image'} ${sized({box: node.box, scale})} placeholder${node.holds > 0 ? ` (holds ${node.holds} text lines)` : ''}`
  if (node.kind === 'text') return textLine({node, scale})
  return `box ${sized({box: node.box, scale})}${layoutPhrase(node.layout)}${paintPhrase(node)}`
}

function textLine(input: {node: Extract<DesignNode, {kind: 'text'}>; scale: number}): string {
  const {node, scale} = input
  const type =
    node.typography === undefined
      ? ` size ~${Math.round(node.box.h / scale / TOLERANCES.capRatio)}`
      : ` size ${Math.round(node.typography.size)}/${node.typography.weight}`
  const role = node.role === undefined || node.role === 'unknown' ? '' : ` ${node.role}`
  const lines = node.lines.length > 1 ? ` (${node.lines.length} lines)` : ''
  const family = node.typography?.family ?? null
  const words = node.text
    .split('\n')
    .flatMap((line) => line.split('\t'))
    .flatMap((part) => part.split(' '))
    .filter((word) => word !== '')
    .join(' ')
  return `text "${words}"${type}${role}${lines}${family === null ? '' : ` ${family}`}`
}

function paintPhrase(node: Extract<DesignNode, {kind: 'box'}>): string {
  const paint = [
    backgroundPhrase(node.paint),
    node.border === null ? null : `border ${node.border.width} ${node.border.color}`,
    node.radius > 0 ? `radius ${node.radius}` : null,
  ].filter((part) => part !== null)
  return paint.length === 0 ? '' : `, ${paint.join(', ')}`
}

function backgroundPhrase(paint: Extract<DesignNode, {kind: 'box'}>['paint']): string | null {
  if (paint === undefined) return null
  if (paint.gradient === undefined) return `background ${paint.background}`
  const {from, to, axis} = paint.gradient
  return `background gradient ${from} to ${to} ${axis}`
}

function layoutPhrase(layout: Partial<ContainerLayout> | undefined): string {
  if (layout?.direction === undefined) return ''
  const gap = layout.gap === undefined ? '' : ` gap ${layout.gap.px}`
  const align = layout.align === undefined ? '' : ` align ${layout.align}`
  const [padding = ''] = paddingPhrase(layout.padding).map((phrase) => ` ${phrase}`)
  return ` ${layout.direction}${gap}${align}${layout.wrap === true ? ' wrapping' : ''}${padding}`
}

function paddingSides(padding: ContainerLayout['padding']): number[] {
  const {top, right, bottom, left} = padding
  if (top !== bottom || right !== left) return [top, right, bottom, left]
  return top === right ? [top] : [top, right]
}

function sized(input: {box: DesignNode['box']; scale: number}): string {
  const {box, scale} = input
  return `${Math.round(box.w / scale)}x${Math.round(box.h / scale)}`
}

const PLACEHOLDER_IMPORTS: Record<Framework, {line: string; style: string}> = {
  react: {line: "import type {CSSProperties} from 'react'", style: 'CSSProperties'},
  solid: {line: "import type {JSX} from 'solid-js'", style: 'JSX.CSSProperties'},
}

const PLACEHOLDER_GLYPHS: Record<string, [string, string][]> = {
  icon: [
    ['width', "'40%'"],
    ['height', "'40%'"],
    ['border-radius', "'22%'"],
  ],
  logo: [
    ['width', "'62%'"],
    ['height', "'28%'"],
    ['border-radius', "'999px'"],
  ],
  image: [
    ['width', "'48%'"],
    ['height', "'38%'"],
    ['border-radius', "'12%'"],
    ['display', "'flex'"],
    ['align-items', "'center'"],
    ['justify-content', "'center'"],
  ],
  avatar: [
    ['width', "'42%'"],
    ['height', "'42%'"],
    ['border-radius', "'50%'"],
  ],
}

const PLACEHOLDER_ROOT: [string, string][] = [
  ['width', "'100%'"],
  ['height', "'100%'"],
  ['box-sizing', "'border-box'"],
  ['display', "'flex'"],
  ['align-items', "'center'"],
  ['justify-content', "'center'"],
  ['overflow', "'hidden'"],
  ['border-radius', "props.kind === 'avatar' ? '50%' : '8px'"],
  ['background', '`linear-gradient(135deg, hsl(${hue} 32% 94%), hsl(${(hue + 40) % 360} 32% 86%))`'],
  ['aspect-ratio', 'props.ratio === undefined ? undefined : String(props.ratio)'],
]

const PLACEHOLDER_SPOT: [string, string][] = [
  ['width', "'38%'"],
  ['height', "'48%'"],
  ['border-radius', "'50%'"],
  ['background', '`hsl(${hue} 30% 93%)`'],
]

function placeholderSource(framework: Framework): string {
  const {line, style} = PLACEHOLDER_IMPORTS[framework]
  const object = (entries: [string, string][]): string => styleObject({framework, entries})
  const glyphs = Object.entries(PLACEHOLDER_GLYPHS).map(([kind, entries]) => `  ${kind}: ${object(entries)},`)
  return [
    line,
    '',
    "type PlaceholderKind = 'icon' | 'logo' | 'image' | 'avatar'",
    '',
    'type PlaceholderProps = {kind: PlaceholderKind; label?: string; ratio?: number}',
    '',
    `const GLYPHS: Record<PlaceholderKind, ${style}> = {`,
    ...glyphs,
    '}',
    '',
    'export function Placeholder(props: PlaceholderProps) {',
    '  const hue = hash(props.label ?? props.kind) % 360',
    `  const glyph: ${style} = {...GLYPHS[props.kind], background: \`hsl(\${hue} 28% 74% / 0.75)\`}`,
    '  return (',
    `    <div aria-hidden="true" ${PLACEHOLDER_ATTR}={props.kind} style={${object(PLACEHOLDER_ROOT)}}>`,
    '      <div style={glyph}>',
    `        {props.kind === 'image' ? <div style={${object(PLACEHOLDER_SPOT)}} /> : null}`,
    '      </div>',
    '    </div>',
    '  )',
    '}',
    '',
    'function hash(text: string): number {',
    '  return [...text].reduce(',
    '    (value, character) => Math.imul(value ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0,',
    '    2166136261,',
    '  )',
    '}',
    '',
  ].join('\n')
}

function styleObject(input: {framework: Framework; entries: [string, string][]}): string {
  const pairs = input.entries.map(([name, value]) => {
    const [first = '', ...rest] = name.split('-')
    const key =
      input.framework === 'solid'
        ? `'${name}'`
        : [first, ...rest.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)].join('')
    return `${key}: ${value}`
  })
  return `{${pairs.join(', ')}}`
}

const STALLED_NAMED = 3

const ANCHOR_LENGTH = 40

const FLIPPED_NAMED = 3

const LISTED = 6

const ORDINAL_SUFFIXES: Partial<Record<number, string>> = {1: 'st', 2: 'nd', 3: 'rd'}

const NOUNS = {
  text: ['text', 'texts'],
  image: ['image', 'images'],
  box: ['box', 'boxes'],
  card: ['card', 'cards'],
} as const

const INDENT = '  '

const SECTION_DEPTH = 1
