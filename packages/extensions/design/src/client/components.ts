import {formatHex, formatHex8, parse} from 'culori'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, Glyph, LiveComponent, LiveStyles, SourceLoc} from '../shared/types.js'

const SOURCE_ATTR = 'data-conciv-source'
const NORMAL_LINE_HEIGHT = 1.2

type Viewport = {width: number; height: number}
type Realm = Window & typeof globalThis

function readSource(el: Element): SourceLoc | null {
  const raw = el.getAttribute(SOURCE_ATTR)
  if (!raw) return null
  const parts = raw.split(':')
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(':')
  if (!file || !Number.isFinite(line) || !Number.isFinite(column)) return null
  return {file, line, column}
}

function clipped(input: {rect: DOMRect; viewport: Viewport}): Box {
  const {rect, viewport} = input
  const left = Math.max(0, Math.round(rect.left))
  const top = Math.max(0, Math.round(rect.top))
  const right = Math.min(viewport.width, Math.round(rect.right))
  const bottom = Math.min(viewport.height, Math.round(rect.bottom))
  return {x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top)}
}

function toHex(color: string): string {
  const parsed = parse(color)
  if (parsed === undefined) return color
  if (parsed.alpha !== undefined && parsed.alpha < 1) return formatHex8(parsed)
  return formatHex(parsed)
}

function readStyles(style: CSSStyleDeclaration): LiveStyles {
  const fontSize = Number.parseFloat(style.fontSize)
  const lineHeight = Number.parseFloat(style.lineHeight)
  return {
    background: toHex(style.backgroundColor),
    color: toHex(style.color),
    fontSize,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * NORMAL_LINE_HEIGHT,
    fontWeight: Number(style.fontWeight),
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
  }
}

function readAxis(el: Element): LiveComponent['axis'] {
  const parent = el.parentElement
  const view = el.ownerDocument.defaultView
  if (parent === null || view === null) return null
  const style = view.getComputedStyle(parent)
  if (style.display.includes('grid')) return 'row'
  if (style.display.includes('flex') && style.flexDirection.startsWith('row')) return 'row'
  return 'column'
}

function ownTextNodes(el: Element): Text[] {
  return [...el.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  )
}

function measureTextBox(input: {nodes: Text[]; viewport: Viewport}): Box | null {
  const first = input.nodes[0]
  if (first === undefined) return null
  const rects = input.nodes.map((node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect()
  })
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return clipped({rect: new DOMRect(left, top, right - left, bottom - top), viewport: input.viewport})
}

function glyphNodes(input: {el: Element; view: Realm}): Text[] {
  const {el, view} = input
  return [...el.childNodes].flatMap((node): Text[] => {
    if (node instanceof view.Text) return (node.textContent ?? '').trim() === '' ? [] : [node]
    if (!(node instanceof view.Element) || node.hasAttribute(SOURCE_ATTR)) return []
    return glyphNodes({el: node, view})
  })
}

function glyphBox(input: {rect: DOMRect; bounds: Box}): Box | null {
  const {rect, bounds} = input
  const left = Math.max(bounds.x, Math.floor(rect.left) - TOLERANCES.glyphHalo)
  const top = Math.max(bounds.y, Math.floor(rect.top) - TOLERANCES.glyphHalo)
  const right = Math.min(bounds.x + bounds.w, Math.ceil(rect.right) + TOLERANCES.glyphHalo)
  const bottom = Math.min(bounds.y + bounds.h, Math.ceil(rect.bottom) + TOLERANCES.glyphHalo)
  if (right <= left || bottom <= top) return null
  return {x: left, y: top, w: right - left, h: bottom - top}
}

function placeholderFields(input: {el: Element; view: Realm}): (HTMLInputElement | HTMLTextAreaElement)[] {
  const {el, view} = input
  const own =
    (el instanceof view.HTMLInputElement || el instanceof view.HTMLTextAreaElement) &&
    el.value === '' &&
    el.placeholder !== ''
      ? [el]
      : []
  const nested = [...el.children].flatMap((child) =>
    child.hasAttribute(SOURCE_ATTR) ? [] : placeholderFields({el: child, view}),
  )
  return [...own, ...nested]
}

function placeholderGlyph(input: {field: HTMLInputElement | HTMLTextAreaElement}): Glyph[] {
  const {field} = input
  const outer = field.getBoundingClientRect()
  const rect = new DOMRect(
    outer.left + field.clientLeft,
    outer.top + field.clientTop,
    field.clientWidth,
    field.clientHeight,
  )
  const box = {x: Math.ceil(rect.left), y: Math.ceil(rect.top), w: Math.floor(rect.width), h: Math.floor(rect.height)}
  return [{text: field.placeholder, boxes: [box]}]
}

function measureGlyphs(input: {el: Element; view: Realm; bounds: Box}): Glyph[] {
  const texts = glyphNodes(input).flatMap((node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    const boxes = [...range.getClientRects()].flatMap((rect) => glyphBox({rect, bounds: input.bounds}) ?? [])
    return boxes.length === 0 ? [] : [{text: node.textContent ?? '', boxes}]
  })
  const placeholders = placeholderFields(input).flatMap((field) => placeholderGlyph({field}))
  return [...texts, ...placeholders]
}

function siblingIndex(el: Element): number {
  const parent = el.parentElement
  if (parent === null) return 1
  return [...parent.children].indexOf(el) + 1
}

function componentTree(input: {el: Element; viewport: Viewport; view: Realm}): LiveComponent {
  const {el, viewport} = input
  const nodes = ownTextNodes(el)
  const box = clipped({rect: el.getBoundingClientRect(), viewport})
  return {
    source: readSource(el),
    tag: el.tagName.toLowerCase(),
    text: nodes
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
    box,
    textBox: measureTextBox({nodes, viewport}),
    glyphs: measureGlyphs({el, view: input.view, bounds: box}),
    axis: readAxis(el),
    styles: readStyles(input.view.getComputedStyle(el)),
    index: siblingIndex(el),
    children: collectUnder({el, viewport, view: input.view}),
  }
}

function collectUnder(input: {el: Element; viewport: Viewport; view: Realm}): LiveComponent[] {
  return [...input.el.children].flatMap((child) =>
    child.hasAttribute(SOURCE_ATTR)
      ? [componentTree({el: child, viewport: input.viewport, view: input.view})]
      : collectUnder({el: child, viewport: input.viewport, view: input.view}),
  )
}

export function collectComponents({root}: {root: Document}): LiveComponent[] {
  const view = root.defaultView
  if (view === null) return []
  const viewport = {width: view.innerWidth, height: view.innerHeight}
  return collectUnder({el: root.documentElement, viewport, view})
}
