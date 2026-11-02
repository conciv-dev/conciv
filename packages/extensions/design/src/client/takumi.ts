import init, {Painter, type FontLoader, type Matrix, type PaintTree, type TextNode} from 'takumi-paint/no-init'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, LiveComponent} from '../shared/types.js'

type Opinion = {boxes: Map<string, Box>; confidence: number}
type OpinionInput = {doc: Document; width: number; height: number; components: LiveComponent[]; wasm: string | null}
type Face = {family: string; weight: number | undefined; style: string; url: string}
type Stamped = {html: string; paths: Map<string, string>}
type Edges = {left: number; top: number; right: number; bottom: number}

const UNSUPPORTED = ['@container', 'container-type', 'container-name', 'clamp(', 'min(', 'max(']
const SUPPORTED_MAX = 'minmax('
const VARIATIONS = 'font-variation-settings'
const OPTICAL_SIZE = 'opsz'
const STRIPPED = 'script, link, style, noscript, template'
const LAYOUT_NEUTRAL = '*{opacity:1!important;visibility:visible!important}'
const STAMP_PREFIX = 'conciv-takumi-'
const SHADOW_SEGMENT = 's'
const URL_OPEN = 'url('
const WEIGHT_KEYWORDS: Record<string, number> = {normal: 400, bold: 700}
const CONFIDENCE_SCALE_PX = 50

const painterSlot: {painter: Promise<Painter | null> | null} = {painter: null}
const fontBytes = new Map<string, Promise<Uint8Array | null>>()

export function secondOpinion(input: OpinionInput): Promise<Opinion | null> {
  const budget = new Promise<null>((resolve) => setTimeout(() => resolve(null), TOLERANCES.opinionBudgetMs))
  return Promise.race([layOut(input).catch(() => null), budget])
}

async function layOut(input: OpinionInput): Promise<Opinion | null> {
  const {doc, width, height, components} = input
  const page = laidOutPage(input)
  if (page === null) return null
  const {view, rules} = page
  const engine = await engineWith({...page, doc, components})
  if (engine === null) return null
  const {fonts, painter} = engine
  const stamped = stamp({doc, view, components})
  const css = [
    ...rules.filter((rule) => !(rule instanceof view.CSSFontFaceRule)).map((rule) => rule.cssText),
    LAYOUT_NEUTRAL,
  ]
  const tree = await painter.paint(stamped.html, {width, height, css: css.join('\n'), fonts})
  return {boxes: treeBoxes({tree, paths: stamped.paths, size: {width, height}}), confidence: confidence(width)}
}

async function engineWith(input: {
  doc: Document
  view: Window & typeof globalThis
  rules: CSSRule[]
  components: LiveComponent[]
  wasm: string
}): Promise<{fonts: FontLoader[]; painter: Painter} | null> {
  const fonts = await pageFonts(input)
  if (fonts === null) return null
  const painter = await painterAt(input.wasm)
  return painter === null ? null : {fonts, painter}
}

function laidOutPage(input: OpinionInput): {view: Window & typeof globalThis; rules: CSSRule[]; wasm: string} | null {
  const view = input.doc.defaultView
  if (input.wasm === null || view === null) return null
  const rules = sheetRules(input.doc)
  if (rules.some(outsideSubset)) return null
  return {view, rules, wasm: input.wasm}
}

function sheetRules(doc: Document): CSSRule[] {
  return [...doc.styleSheets, ...doc.adoptedStyleSheets].flatMap((sheet) => {
    try {
      return [...sheet.cssRules]
    } catch {
      return []
    }
  })
}

function outsideSubset(rule: CSSRule): boolean {
  const text = rule.cssText.replaceAll(SUPPORTED_MAX, '')
  if (UNSUPPORTED.some((token) => text.includes(token))) return true
  return text.includes(VARIATIONS) && text.includes(OPTICAL_SIZE)
}

async function pageFonts(input: {
  doc: Document
  view: Window & typeof globalThis
  rules: CSSRule[]
  components: LiveComponent[]
}): Promise<FontLoader[] | null> {
  const {doc, view, rules, components} = input
  const faces = rules.flatMap((rule) => (rule instanceof view.CSSFontFaceRule ? (faceFrom(rule) ?? []) : []))
  const loaded = [...doc.fonts].filter((face) => face.status === 'loaded')
  const declared = loaded.every((face) => faces.some((entry) => entry.family === unquoted(face.family)))
  if (!declared) return null
  const families = new Set(loaded.map((face) => unquoted(face.family)))
  const rendered = textComponents(components).every((component) =>
    families.has(firstFamily(component.styles.fontFamily)),
  )
  if (!rendered) return null
  const used = faces.filter((face) => families.has(face.family))
  const bytes = await Promise.all(used.map(fetchFace))
  if (bytes.some((data) => data === null)) return null
  return used.flatMap((face, index) => {
    const data = bytes[index]
    if (data === undefined || data === null) return []
    return [{name: face.family, data, style: face.style, ...(face.weight === undefined ? {} : {weight: face.weight})}]
  })
}

function faceFrom(rule: CSSFontFaceRule): Face | null {
  const raw = firstUrl(rule.style.getPropertyValue('src'))
  if (raw === null) return null
  return {
    family: unquoted(rule.style.getPropertyValue('font-family')),
    weight: faceWeight(rule.style.getPropertyValue('font-weight').trim()),
    style: rule.style.getPropertyValue('font-style').trim() || 'normal',
    url: new URL(raw, document.baseURI).href,
  }
}

function firstUrl(source: string): string | null {
  const start = source.indexOf(URL_OPEN)
  const end = start === -1 ? -1 : source.indexOf(')', start)
  if (end === -1) return null
  return unquoted(source.slice(start + URL_OPEN.length, end))
}

function faceWeight(weight: string): number | undefined {
  const numeric = Number(weight)
  return Number.isFinite(numeric) && weight !== '' ? numeric : WEIGHT_KEYWORDS[weight]
}

function unquoted(value: string): string {
  return value.trim().replaceAll('"', '').replaceAll("'", '').trim()
}

function firstFamily(stack: string): string {
  return unquoted(stack.split(',')[0] ?? '')
}

function textComponents(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [
    ...(component.glyphs.length > 0 ? [component] : []),
    ...textComponents(component.children),
  ])
}

function fetchFace(face: Face): Promise<Uint8Array | null> {
  const key = `${face.family}|${face.weight ?? ''}|${face.style}`
  const cached = fontBytes.get(key)
  if (cached !== undefined) return cached
  const loading = fetch(face.url)
    .then(async (response) => (response.ok ? new Uint8Array(await response.arrayBuffer()) : null))
    .catch(() => null)
  fontBytes.set(key, loading)
  return loading
}

function painterAt(wasm: string): Promise<Painter | null> {
  painterSlot.painter ??= init({module_or_path: wasm}).then(
    () => new Painter(),
    () => null,
  )
  return painterSlot.painter
}

function stamp(input: {doc: Document; view: Window & typeof globalThis; components: LiveComponent[]}): Stamped {
  const {doc} = input
  const clone = doc.documentElement.cloneNode(true)
  if (!(clone instanceof input.view.Element)) return {html: '', paths: new Map()}
  const stamped = flatten(input.components).flatMap((component) => {
    const element = elementAt({root: clone, path: component.path})
    if (element === null) return []
    if (element.id === '') element.id = `${STAMP_PREFIX}${component.path.replaceAll('/', '-')}`
    return [[element.id, component.path] as const]
  })
  copyValues({from: doc.documentElement, to: clone})
  clone.querySelectorAll(STRIPPED).forEach((element) => element.remove())
  return {html: `<!doctype html>${clone.outerHTML}`, paths: new Map(stamped)}
}

function flatten(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flatten(component.children)])
}

function elementAt(input: {root: Element; path: string}): Element | null {
  const steps = input.path.split('/').filter((step) => step !== '')
  if (steps.includes(SHADOW_SEGMENT)) return null
  return steps.reduce<Element | null>((element, step) => element?.children[Number(step) - 1] ?? null, input.root)
}

function copyValues(input: {from: Element; to: Element}): void {
  const live = [...input.from.querySelectorAll('input, textarea')]
  const cloned = [...input.to.querySelectorAll('input, textarea')]
  cloned.forEach((element, index) => {
    const value = fieldValue(live[index])
    if (value === null) return
    if (element.tagName === 'TEXTAREA') element.textContent = value
    element.setAttribute('value', value)
  })
}

function fieldValue(field: Element | undefined): string | null {
  if (field === undefined || !('value' in field)) return null
  return typeof field.value === 'string' ? field.value : null
}

function treeBoxes(input: {
  tree: PaintTree
  paths: Map<string, string>
  size: {width: number; height: number}
}): Map<string, Box> {
  const {tree, paths, size} = input
  const pathAt = (id: string | undefined): string | undefined => (id === undefined ? undefined : paths.get(id))
  const boxed = tree.nodes.flatMap((node) => {
    const path = pathAt(node.element?.id)
    if (node.type === 'text' || path === undefined) return []
    const {x, y, width, height} = node.bounds
    return [[path, {left: x, top: y, right: x + width, bottom: y + height}] as const]
  })
  const known = new Map(boxed.toReversed())
  const inline = tree.nodes.flatMap((node) => (node.type === 'text' ? runEdges({node, pathAt}) : []))
  const merged = inline
    .filter(([path]) => !known.has(path))
    .reduce((found, [path, edges]) => found.set(path, joined({a: found.get(path), b: edges})), new Map<string, Edges>())
  return new Map([...known, ...merged].map(([path, edges]) => [path, clipped({edges, size})]))
}

function runEdges(input: {node: TextNode; pathAt: (id: string | undefined) => string | undefined}): [string, Edges][] {
  const {node, pathAt} = input
  const block = pathAt(node.element?.id)
  return node.runs.flatMap((run) => {
    const owner = pathAt(run.element?.id) ?? block
    if (owner === undefined) return []
    const [left, top] = applied({matrix: node.transform, x: run.x, y: run.y - run.ascent})
    const [right, bottom] = applied({matrix: node.transform, x: run.x + run.width, y: run.y + run.descent})
    const edges = {left, top, right, bottom}
    return owners({owner, block}).map((path): [string, Edges] => [path, edges])
  })
}

function owners(input: {owner: string; block: string | undefined}): string[] {
  const {owner, block} = input
  if (owner === block || owner === '') return []
  return [owner, ...owners({owner: owner.slice(0, owner.lastIndexOf('/')), block})]
}

function applied(input: {matrix: Matrix; x: number; y: number}): [number, number] {
  const [a, b, c, d, e, f] = input.matrix
  return [a * input.x + c * input.y + e, b * input.x + d * input.y + f]
}

function joined(input: {a: Edges | undefined; b: Edges}): Edges {
  const {a, b} = input
  if (a === undefined) return b
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

function clipped(input: {edges: Edges; size: {width: number; height: number}}): Box {
  const {edges, size} = input
  const left = Math.max(0, Math.round(edges.left))
  const top = Math.max(0, Math.round(edges.top))
  const right = Math.min(size.width, Math.round(edges.right))
  const bottom = Math.min(size.height, Math.round(edges.bottom))
  return {x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top)}
}

function confidence(width: number): number {
  const p95 = width < TOLERANCES.takumiNarrowBelow ? TOLERANCES.takumiP95.narrow : TOLERANCES.takumiP95.wide
  return 1 - p95 / CONFIDENCE_SCALE_PX
}
