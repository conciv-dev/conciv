import {readdir} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {Visitor, type Expression, type ObjectExpression, type ObjectProperty} from 'oxc-parser'
import {declares} from '../../shared/properties.js'
import {LIBRARY_SHEET_MARKER} from '../../shared/tolerances.js'
import type {ProvenanceMapper, Winner} from '../../shared/types.js'
import {camelToKebab, parseFile, positionOf, UNKNOWN} from './jsx.js'

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

function keyOf(property: ObjectProperty): string | null {
  if (property.computed) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function entriesOf(object: ObjectExpression): {key: string; property: ObjectProperty}[] {
  return object.properties.flatMap((property) => {
    if (property.type !== 'Property') return []
    const key = keyOf(property)
    return key === null ? [] : [{key, property}]
  })
}

function child(input: {node: Expression | undefined; key: string}): Expression | undefined {
  if (input.node?.type !== 'ObjectExpression') return undefined
  return entriesOf(input.node).find((entry) => entry.key === input.key)?.property.value
}

function overrideIn(input: {node: Expression | undefined; path: string[]; property: string}): ObjectProperty | null {
  const object = input.path.reduce((node, key) => child({node, key}), input.node)
  if (object?.type !== 'ObjectExpression') return null
  const matched = entriesOf(object)
    .filter((entry) => declares({declared: camelToKebab(entry.key), property: input.property}))
    .at(-1)
  return matched?.property ?? null
}

async function sourceFiles(cwd: string): Promise<string[]> {
  const root = join(cwd, 'src')
  const names = await readdir(root, {recursive: true}).catch(() => [])
  return names
    .filter((name) => !name.includes('node_modules') && SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext)))
    .map((name) => join(root, name))
}

async function themeOverride(input: {cwd: string; selector: string | null; property: string}): Promise<string | null> {
  if (input.selector === null || !input.selector.startsWith('.')) return null
  const [slotName, slot] = input.selector.slice(1).split('-')
  if (slotName === undefined || slot === undefined) return null
  const path = ['components', slotName, 'styleOverrides', slot]
  for (const file of await sourceFiles(input.cwd)) {
    const parsed = await parseFile(file)
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
    const {line, column} = positionOf({code: parsed.code, offset: override.start})
    return `${parsed.code.slice(override.start, override.end)} (${relative(input.cwd, file)}:${line}:${column})`
  }
  return null
}

export const libraryMapper: ProvenanceMapper = {
  via: 'library',
  applies: ({winner}) => sheetPath(winner) !== null,
  async map(input) {
    const {winner, component} = input
    if (!isLibrary({winner, cwd: input.cwd})) return UNKNOWN
    const override = await themeOverride({cwd: input.cwd, selector: winner.selector, property: input.property})
    return {
      via: 'library',
      ...(component.source === null ? {} : component.source),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
      declaration: winner.declaration,
      ...(override === null ? {} : {suggest: override}),
    }
  },
}
