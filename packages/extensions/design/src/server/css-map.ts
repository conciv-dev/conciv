import {relative} from 'node:path'
import postcss, {AtRule, type Container, type Document, type Root} from 'postcss'
import type {z} from 'zod'
import type {Storage} from 'unstorage'
import {
  parseSync,
  Visitor,
  type JSXAttribute,
  type JSXOpeningElement,
  type Program,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type Argument,
  type JSXExpression,
} from 'oxc-parser'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {DESIGN_TOOLS, type Delta, type LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'

export function createCssMap(input: {project: Storage; cwd: string; bundler: BundlerBridge | undefined}) {
  const {project, cwd} = input
  const css = lazyCssMap(input)
  return {
    declaration: async (request: {
      winner: Winner
      property: string
      component: LiveComponent
      target: number | string
    }): Promise<Provenance> => mapDeclaration({...request, cwd, project, cssMap: await css.cssMap()}),
    site: (source: SourceLoc | null): Promise<Site | null> => readSite({project, source}),
    dispose: css.dispose,
  }
}

type SourceLoc = NonNullable<LiveComponent['source']>

type Provenance = Pick<Delta, 'file' | 'line' | 'column' | 'declaration' | 'selector' | 'suggest'> & {
  via: NonNullable<Delta['via']>
}

const [, , , , , , , winnerDef] = DESIGN_TOOLS

type Winner = NonNullable<z.output<NonNullable<typeof winnerDef.outputSchema>>[string]>

function lazyCssMap(input: {project: Storage; bundler: BundlerBridge | undefined}): {
  cssMap: () => Promise<CssMap>
  dispose: () => void
} {
  const {project} = input
  const build = async (): Promise<CssMap> => buildCssMap({project, files: await cssFiles(project)})
  const cache: {map: Promise<CssMap> | null} = {map: null}
  const unsubscribe = input.bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'hmr-update' && diagnostic.file.endsWith('.css')) cache.map = null
  })
  if (unsubscribe === undefined) return {cssMap: build, dispose: () => {}}
  return {
    cssMap: () => {
      cache.map ??= build()
      return cache.map
    },
    dispose: unsubscribe,
  }
}

async function cssFiles(project: Storage): Promise<string[]> {
  const keys = await project.getKeys('src').catch(() => [])
  return keys.map((key) => key.replaceAll(':', '/')).filter((file) => file.endsWith('.css'))
}

type Parsed = {code: string; program: Program}

type Site = Parsed & {element: JSXOpeningElement}

const UNKNOWN: Provenance = {via: 'unknown'}

async function parseFile(input: {project: Storage; file: string}): Promise<Parsed | null> {
  const {file} = input
  const code = await readText(input)
  if (code === null) return null
  const lang = file.endsWith('.tsx') || file.endsWith('.jsx') ? 'tsx' : 'ts'
  const {program, errors} = parseSync(file, code, {sourceType: 'module', lang})
  if (errors.length > 0) return null
  return {code, program}
}

function positionAt(input: {code: string; offset: number}): {line: number; column: number} {
  const before = input.code.slice(0, input.offset)
  return {line: before.split('\n').length, column: input.offset - before.lastIndexOf('\n')}
}

function offsetAt(input: {code: string; line: number; column: number}): number {
  const lines = input.code.split('\n').slice(0, input.line - 1)
  return lines.reduce((sum, line) => sum + line.length + 1, 0) + input.column - 1
}

async function readSite(input: {project: Storage; source: SourceLoc | null}): Promise<Site | null> {
  if (input.source === null) return null
  const parsed = await parseFile({project: input.project, file: input.source.file})
  if (parsed === null) return null
  const offset = offsetAt({code: parsed.code, line: input.source.line, column: input.source.column})
  const found: JSXOpeningElement[] = []
  new Visitor({
    JSXOpeningElement(node) {
      if (node.start === offset) found.push(node)
    },
  }).visit(parsed.program)
  const element = found[0]
  if (element === undefined) return null
  return {...parsed, element}
}

function findAttribute(input: {element: JSXOpeningElement; name: string}): JSXAttribute | null {
  const found = input.element.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === input.name,
  )
  if (found === undefined || found.type !== 'JSXAttribute') return null
  return found
}

function camelToKebab(key: string): string {
  return [...key].map((char) => (char === char.toLowerCase() ? char : `-${char.toLowerCase()}`)).join('')
}

type CssEntry = {
  file: string
  line: number
  column: number
  selector: string
  media: string[]
  prop: string
  value: string
}

type Parent = Container | Document | undefined

function mediaConditions(parent: Parent): string[] {
  if (parent === undefined || parent.type === 'root' || parent.type === 'document') return []
  const outer = mediaConditions(parent.parent)
  if (!(parent instanceof AtRule) || parent.name !== 'media') return outer
  return [...outer, `@media ${parent.params}`]
}

async function parseCss(input: {project: Storage; file: string}): Promise<Root | null> {
  const css = await readText(input)
  if (css === null) return null
  try {
    return postcss.parse(css, {from: input.file})
  } catch {
    return null
  }
}

function cssEntries(input: {root: Root; file: string}): CssEntry[] {
  const entries: CssEntry[] = []
  input.root.walkDecls((decl) => {
    const {parent} = decl
    const start = decl.source?.start
    if (parent?.type !== 'rule' || start === undefined) return
    for (const selector of parent.selectors) {
      entries.push({
        file: input.file,
        line: start.line,
        column: start.column,
        selector: selector.trim(),
        media: mediaConditions(parent.parent),
        prop: decl.prop,
        value: decl.value,
      })
    }
  })
  return entries
}

function localName(selector: string): string | null {
  if (!selector.startsWith('._')) return null
  const local = selector.split('_')[1]
  if (local === undefined || local === '') return null
  return `.${local}`
}

function selects(input: {entry: CssEntry; selector: string}): boolean {
  if (input.entry.selector === input.selector) return true
  return input.entry.file.endsWith('.module.css') && input.entry.selector === localName(input.selector)
}

async function buildCssMap(input: {project: Storage; files: string[]}): Promise<CssMap> {
  const parsed = await Promise.all(
    input.files.map(async (file) => {
      const root = await parseCss({project: input.project, file})
      if (root === null) return []
      return cssEntries({root, file})
    }),
  )
  const entries = parsed.flat()
  return {
    find: ({selector, property}) => {
      const hit = entries.findLast((entry) => selects({entry, selector}) && declares({declared: entry.prop, property}))
      if (hit === undefined) return null
      return {file: hit.file, line: hit.line, column: hit.column, declaration: `${hit.prop}: ${hit.value}`}
    },
  }
}

async function countDeclarations(input: {project: Storage; file: string; selector: string}): Promise<number> {
  const root = await parseCss(input)
  if (root === null) return 0
  const counts: number[] = []
  root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.trim() === input.selector)) return
    counts.push(rule.nodes.filter((node) => node.type === 'decl').length)
  })
  return counts.reduce((sum, count) => sum + count, 0)
}

const SX_KEYS: Record<string, string[]> = {
  p: ['padding'],
  px: ['padding-left', 'padding-right'],
  py: ['padding-top', 'padding-bottom'],
  pt: ['padding-top'],
  pr: ['padding-right'],
  pb: ['padding-bottom'],
  pl: ['padding-left'],
  m: ['margin'],
  mx: ['margin-left', 'margin-right'],
  my: ['margin-top', 'margin-bottom'],
  mt: ['margin-top'],
  mr: ['margin-right'],
  mb: ['margin-bottom'],
  ml: ['margin-left'],
  bgcolor: ['background-color'],
}

const SPACING_KEYS = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap']

function keyName(property: ObjectProperty): string | null {
  if (property.computed) return null
  const {key} = property
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

function covers(input: {key: string; property: string; sx: boolean}): boolean {
  const declared = (input.sx ? SX_KEYS[input.key] : undefined) ?? [camelToKebab(input.key)]
  return declared.some((name) => declares({declared: name, property: input.property}))
}

function pixelValue(value: string): number | null {
  if (!value.endsWith('px')) return null
  const parsed = Number(value.slice(0, -2))
  return Number.isFinite(parsed) ? parsed : null
}

function suggestion(input: {key: string; value: Expression; target: number | string; live: string}): string | null {
  const {value, target} = input
  if (value.type !== 'Literal' || typeof value.value !== 'number') return null
  if (!SPACING_KEYS.includes(input.key) || typeof target !== 'number') return null
  const live = pixelValue(input.live)
  if (live === null) return null
  const unit = live / value.value
  if (!Number.isFinite(unit) || unit <= 0 || target % unit !== 0) return null
  return `${input.key}: ${target / unit}`
}

function styleObject(attribute: JSXAttribute): ObjectExpression | null {
  const {value} = attribute
  if (value === null || value.type !== 'JSXExpressionContainer') return null
  if (value.expression.type !== 'ObjectExpression') return null
  return value.expression
}

function fromObject(input: {
  site: Site
  object: ObjectExpression
  via: 'sx' | 'style'
  property: string
  target: number | string
  live: string
  file: string
}): Provenance {
  const entries = input.object.properties
  const keys = entries.map((entry) => (entry.type === 'Property' ? keyName(entry) : null))
  const index = keys.findLastIndex(
    (key) => key !== null && covers({key, property: input.property, sx: input.via === 'sx'}),
  )
  const entry = entries[index]
  const key = keys[index]
  if (entry === undefined || entry.type !== 'Property' || key === null || key === undefined) return UNKNOWN
  if (entries.slice(index + 1).some((later) => later.type === 'SpreadElement')) return UNKNOWN
  const {line, column} = located({site: input.site, offset: entry.start})
  const suggest =
    input.via === 'sx' ? suggestion({key, value: entry.value, target: input.target, live: input.live}) : null
  return {
    via: input.via,
    file: input.file,
    line,
    column,
    declaration: input.site.code.slice(entry.start, entry.end),
    ...(suggest === null ? {} : {suggest}),
  }
}

const styleMapper: ProvenanceMapper = {
  via: 'style',
  applies: ({winner}) => winner.inline || winner.sheet.emotion,
  async map(input) {
    const {source} = input.component
    const site = await readSite({project: input.project, source})
    if (site === null || source === null) return UNKNOWN
    const names: ('style' | 'sx')[] = input.winner.inline ? ['style', 'sx'] : ['sx']
    const found = names
      .map((via) => ({via, attribute: findAttribute({element: site.element, name: via})}))
      .find((item) => item.attribute !== null)
    if (found === undefined || found.attribute === null) return UNKNOWN
    const {via, attribute} = found
    const object = styleObject(attribute)
    if (object !== null) {
      return fromObject({
        site,
        object,
        via,
        property: input.property,
        target: input.target,
        live: input.winner.value,
        file: source.file,
      })
    }
    const {line, column} = located({site, offset: attribute.start})
    return {via, file: source.file, line, column, declaration: site.code.slice(attribute.start, attribute.end)}
  },
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx']

function sheetPath(winner: Winner): string | null {
  const {viteDevId, href} = winner.sheet
  if (viteDevId !== null) return viteDevId.split('?')[0] ?? viteDevId
  return href
}

function isLibrary(input: {winner: Winner; cwd: string}): boolean {
  const path = sheetPath(input.winner)
  if (path === null) return false
  if (path.includes(LIBRARY_SHEET_MARKER)) return true
  if (input.winner.sheet.viteDevId === null) return false
  return relative(input.cwd, path).startsWith('..')
}

function propertyKey(property: ObjectProperty): string | null {
  if (property.computed) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function objectEntries(object: ObjectExpression): {key: string; property: ObjectProperty}[] {
  return object.properties.flatMap((property) => {
    if (property.type !== 'Property') return []
    const key = propertyKey(property)
    return key === null ? [] : [{key, property}]
  })
}

function childExpression(input: {node: Expression | undefined; key: string}): Expression | undefined {
  if (input.node?.type !== 'ObjectExpression') return undefined
  return objectEntries(input.node).find((entry) => entry.key === input.key)?.property.value
}

function overrideIn(input: {node: Expression | undefined; path: string[]; property: string}): ObjectProperty | null {
  const object = input.path.reduce((node, key) => childExpression({node, key}), input.node)
  if (object?.type !== 'ObjectExpression') return null
  const matched = objectEntries(object)
    .filter((entry) => declares({declared: camelToKebab(entry.key), property: input.property}))
    .at(-1)
  return matched?.property ?? null
}

async function projectFiles(project: Storage): Promise<string[]> {
  const keys = await project.getKeys('src').catch(() => [])
  return keys.map((key) => key.replaceAll(':', '/')).filter((file) => !file.includes('node_modules'))
}

async function themeOverride(input: {
  project: Storage
  selector: string | null
  property: string
}): Promise<string | null> {
  if (input.selector === null || !input.selector.startsWith('.')) return null
  const [slotName, slot] = input.selector.slice(1).split('-')
  if (slotName === undefined || slot === undefined) return null
  const path = ['components', slotName, 'styleOverrides', slot]
  const files = (await projectFiles(input.project)).filter((file) =>
    SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext)),
  )
  for (const file of files) {
    const parsed = await parseFile({project: input.project, file})
    if (parsed === null || !parsed.code.includes('createTheme')) continue
    const found: ObjectProperty[] = []
    new Visitor({
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'createTheme') return
        const [options] = node.arguments
        if (options === undefined || options.type === 'SpreadElement') return
        const override = overrideIn({node: options, path, property: input.property})
        if (override !== null) found.push(override)
      },
    }).visit(parsed.program)
    const override = found[0]
    if (override === undefined) continue
    const {line, column} = positionAt({code: parsed.code, offset: override.start})
    return `${parsed.code.slice(override.start, override.end)} (${file}:${line}:${column})`
  }
  return null
}

const libraryMapper: ProvenanceMapper = {
  via: 'library',
  applies: ({winner}) => sheetPath(winner) !== null,
  async map(input) {
    const {winner, component} = input
    if (!isLibrary({winner, cwd: input.cwd})) return UNKNOWN
    const override = await themeOverride({
      project: input.project,
      selector: winner.selector,
      property: input.property,
    })
    return {
      via: 'library',
      ...(component.source === null ? {} : component.source),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
      declaration: winner.declaration,
      ...(override === null ? {} : {suggest: override}),
    }
  },
}

type Piece = {text: string; start: number}

type Walk = {consts: Map<string, Expression>; seen: Set<string>}

const CLASS_HELPERS = ['clsx', 'cn']

const SELECTOR_DELIMITERS = [' ', '.', ':', '#', '[', ']', '>', '+', '~', ',', '(', ')', '*', '&']

function classToken(selector: string | null): string | null {
  if (selector === null || !selector.startsWith('.')) return null
  const token = selector.slice(1)
  if (token === '' || [...token].some((char) => SELECTOR_DELIMITERS.includes(char))) return null
  return token
}

function pieces(input: Walk & {node: Argument | JSXExpression}): Piece[] {
  const {node} = input
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [{text: node.value, start: node.start + 1}] : []
    case 'TemplateLiteral':
      return [
        ...node.quasis.map((quasi) => ({text: quasi.value.cooked ?? quasi.value.raw, start: quasi.start + 1})),
        ...node.expressions.flatMap((expression) => pieces({...input, node: expression})),
      ]
    case 'CallExpression':
      if (node.callee.type !== 'Identifier' || !CLASS_HELPERS.includes(node.callee.name)) return []
      return node.arguments.flatMap((argument) => pieces({...input, node: argument}))
    case 'SpreadElement':
      return pieces({...input, node: node.argument})
    case 'ConditionalExpression':
      return [node.consequent, node.alternate].flatMap((branch) => pieces({...input, node: branch}))
    case 'LogicalExpression':
      return [node.left, node.right].flatMap((side) => pieces({...input, node: side}))
    case 'Identifier':
      return constPieces({...input, name: node.name})
    default:
      return []
  }
}

function constPieces(input: Walk & {name: string}): Piece[] {
  const init = input.consts.get(input.name)
  if (init === undefined || input.seen.has(input.name)) return []
  return pieces({consts: input.consts, seen: new Set([...input.seen, input.name]), node: init})
}

function siteConsts(site: Site): Map<string, Expression> {
  const consts = new Map<string, Expression>()
  new Visitor({
    VariableDeclaration(node) {
      if (node.kind !== 'const') return
      for (const declarator of node.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.init !== null)
          consts.set(declarator.id.name, declarator.init)
      }
    },
  }).visit(site.program)
  return consts
}

function classPieces(site: Site): Piece[] {
  const attribute = findAttribute({element: site.element, name: 'className'})
  if (attribute === null || attribute.value === null) return []
  const {value} = attribute
  if (value.type === 'Literal') return [{text: value.value, start: value.start + 1}]
  if (value.type !== 'JSXExpressionContainer') return []
  return pieces({consts: siteConsts(site), seen: new Set(), node: value.expression})
}

function tokenOffset(input: {piece: Piece; token: string}): number | null {
  const words = input.piece.text.split(' ')
  const index = words.indexOf(input.token)
  if (index === -1) return null
  return input.piece.start + words.slice(0, index).reduce((sum, word) => sum + word.length + 1, 0)
}

const classNameMapper: ProvenanceMapper = {
  via: 'className',
  applies: ({winner}) => classToken(winner.selector) !== null,
  async map(input) {
    const token = classToken(input.winner.selector)
    const {source} = input.component
    if (token === null || source === null) return UNKNOWN
    const site = await readSite({project: input.project, source})
    if (site === null) return UNKNOWN
    const offset = classPieces(site)
      .map((piece) => tokenOffset({piece, token}))
      .find((found) => found !== null)
    if (offset === undefined || offset === null) return UNKNOWN
    const selector = `.${token}`
    const hit = input.cssMap.find({selector, property: input.property})
    if (hit !== null && (await countDeclarations({project: input.project, file: hit.file, selector})) > 1) {
      return UNKNOWN
    }
    const {line, column} = located({site, offset})
    return {via: 'className', file: source.file, line, column, declaration: token, selector}
  },
}

const cssMapper: ProvenanceMapper = {
  via: 'css',
  applies: ({winner}) => winner.selector !== null,
  map: (input) => {
    const {selector} = input.winner
    if (selector === null) return Promise.resolve(UNKNOWN)
    const hit = input.cssMap.find({selector, property: input.property})
    if (hit === null) return Promise.resolve(UNKNOWN)
    return Promise.resolve({via: 'css', ...hit, selector})
  },
}

const emotionMapper: ProvenanceMapper = {
  via: 'emotion',
  applies: ({winner}) => winner.sheet.emotion,
  map: ({component, winner}) =>
    Promise.resolve({
      via: 'emotion',
      ...(component.source === null ? {} : {file: component.source.file}),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
    }),
}

const styledMapper: ProvenanceMapper = {
  via: 'styled',
  applies: ({winner}) => winner.sheet.styled,
  map: ({component, winner}) =>
    Promise.resolve({
      via: 'styled',
      ...(component.source === null ? {} : {file: component.source.file}),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
    }),
}

const MAPPERS: ProvenanceMapper[] = [
  styleMapper,
  libraryMapper,
  classNameMapper,
  cssMapper,
  emotionMapper,
  styledMapper,
]

async function mapDeclaration(mapped: MapInput): Promise<Provenance> {
  for (const mapper of MAPPERS) {
    if (!mapper.applies(mapped)) continue
    const provenance = await mapper.map(mapped)
    if (provenance.via !== 'unknown') return provenance
  }
  return UNKNOWN
}

type MapInput = Parameters<ProvenanceMapper['map']>[0]

async function readText(input: {project: Storage; file: string}): Promise<string | null> {
  const raw: unknown = await input.project.getItemRaw(input.file).catch(() => null)
  return raw instanceof Uint8Array ? new TextDecoder().decode(raw) : null
}

function located(input: {site: Site; offset: number}): {line: number; column: number} {
  return positionAt({code: input.site.code, offset: input.offset})
}

type ProvenanceMapper = {
  via: Provenance['via']
  applies(input: {winner: Winner; component: LiveComponent}): boolean
  map(input: {
    winner: Winner
    component: LiveComponent
    property: string
    target: number | string
    cwd: string
    project: Storage
    cssMap: CssMap
  }): Promise<Provenance>
}

type CssMap = {
  find(input: {
    selector: string
    property: string
  }): {file: string; line: number; column: number; declaration: string} | null
}

const LIBRARY_SHEET_MARKER = '/node_modules/'

function declares(input: {declared: string; property: string}): boolean {
  return designConfig
    .propertyAliases(input.property)
    .some((alias) => alias === input.declared || alias.startsWith(`${input.declared}-`))
}
