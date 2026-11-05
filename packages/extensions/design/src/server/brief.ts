import {uniqBy} from 'es-toolkit'
import type {Box, Design, DesignNode, Match, Words} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export function createBrief(): {
  outline(design: Design): string[]
  placeholder(framework: Framework): string
  line(input: {node: Node; scale: number}): string
  families(root: DesignNode): string[]
  padding(padding: Padding | undefined): string[]
} {
  return {
    outline: designOutline,
    placeholder: placeholderSource,
    line: nodeLine,
    families: designFamilies,
    padding: paddingPhrase,
  }
}

type Node = Match['node']
type TextNode = Extract<Node, {kind: 'text'}>
type BoxNode = Extract<Node, {kind: 'box'}>
type Layout = NonNullable<Node['layout']>
type Padding = NonNullable<Layout['padding']>
type Framework = Parameters<Words['placeholder']>[0]

const TOLERANCES = designConfig.tolerances

function designOutline(design: Design): string[] {
  const {scale, root} = design
  const page = `page ${sized({area: root.box, scale})}${layoutPhrase(root.layout)}`
  const families = designFamilies(root)
  const fonts = families.length === 0 ? [] : [`fonts: ${families.join(', ')}`]
  return [page, ...fonts, ...outlineLines({children: root.children, depth: SECTION_DEPTH, scale})]
}

function designFamilies(root: DesignNode): string[] {
  const families = [...walk(root)].flatMap(({node}) => {
    const family = node.kind === 'text' ? (node.typography?.family ?? null) : null
    return family === null ? [] : [leadingFamily(family)]
  })
  return uniqBy(families, (family) => family.toLowerCase())
}

function leadingFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').replaceAll('"', '').replaceAll("'", '').trim()
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

function nodeLine(input: {node: Node; scale: number}): string {
  const {node, scale} = input
  if (node.kind === 'image') {
    const holds = node.holds > 0 ? ` (holds ${node.holds} text lines)` : ''
    return `${designConfig.iconSized(node.box) ? 'icon' : 'image'} ${sized({area: node.box, scale})} placeholder${holds}`
  }
  if (node.kind === 'text') return textLine({node, scale})
  return `box ${sized({area: node.box, scale})}${layoutPhrase(node.layout)}${paintPhrase(node)}`
}

function textLine(input: {node: TextNode; scale: number}): string {
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

function paintPhrase(node: BoxNode): string {
  const paint = [
    backgroundPhrase(node.paint),
    node.border === null ? null : `border ${node.border.width} ${node.border.color}`,
    node.radius > 0 ? `radius ${node.radius}` : null,
  ].filter((part) => part !== null)
  return paint.length === 0 ? '' : `, ${paint.join(', ')}`
}

function backgroundPhrase(paint: BoxNode['paint']): string | null {
  if (paint === undefined) return null
  if (paint.gradient === undefined) return `background ${paint.background}`
  const {from, to, axis} = paint.gradient
  return `background gradient ${from} to ${to} ${axis}`
}

function layoutPhrase(layout: Partial<Layout> | undefined): string {
  if (layout?.direction === undefined) return ''
  const gap = layout.gap === undefined ? '' : ` gap ${layout.gap.px}`
  const align = layout.align === undefined ? '' : ` align ${layout.align}`
  const [padding = ''] = paddingPhrase(layout.padding).map((phrase) => ` ${phrase}`)
  return ` ${layout.direction}${gap}${align}${layout.wrap === true ? ' wrapping' : ''}${padding}`
}

function sized(input: {area: Box; scale: number}): string {
  return `${Math.round(input.area.w / input.scale)}x${Math.round(input.area.h / input.scale)}`
}

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
    `    <div aria-hidden="true" ${designConfig.attributes.placeholder}={props.kind} style={${object(PLACEHOLDER_ROOT)}}>`,
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
    const camel = [first, ...rest.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)].join('')
    return `${input.framework === 'solid' ? `'${name}'` : camel}: ${value}`
  })
  return `{${pairs.join(', ')}}`
}

function paddingPhrase(padding: Padding | undefined): string[] {
  const sides = padding === undefined ? [] : paddingSides(padding)
  return sides.every((side) => side === 0) ? [] : [`padding ${sides.join(' ')}`]
}

function paddingSides(padding: Padding): number[] {
  const {top, right, bottom, left} = padding
  if (top !== bottom || right !== left) return [top, right, bottom, left]
  return top === right ? [top] : [top, right]
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

const SECTION_DEPTH = 1

const INDENT = '  '
