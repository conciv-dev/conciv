import {Effect} from 'effect'
import type {EvlogError} from 'evlog'
import {parseSync, Visitor} from 'oxc-parser'
import {designErrors} from '../errors/errors.js'
import type {ImportDeclaration, JSXElementName, JSXMemberExpressionObject, JSXOpeningElement, Program} from 'oxc-parser'

export const KEY_ATTRIBUTE = 'data-conciv-key'
export const SITE_ATTRIBUTE = 'data-conciv-site'

const FRAMEWORK_PACKAGES = ['solid-js', 'react', 'react-dom']

export type Parsed = {readonly openings: JSXOpeningElement[]; readonly imported: Set<string>}

export type Locate = (offset: number) => number

export function parseModule(file: string, code: string): Effect.Effect<Parsed, EvlogError> {
  return Effect.try({
    try: () => parseSync(file, code, {sourceType: 'module', lang: file.endsWith('.tsx') ? 'tsx' : 'jsx'}),
    catch: (cause) => designErrors.UNPARSED({file, detail: String(cause)}),
  }).pipe(
    Effect.flatMap((parsed) => {
      const [error] = parsed.errors
      if (error !== undefined) return Effect.fail(designErrors.UNPARSED({file, detail: error.message}))
      return Effect.succeed({openings: collectOpenings(parsed.program), imported: importedComponents(parsed.program)})
    }),
  )
}

function collectOpenings(program: Program): JSXOpeningElement[] {
  const openings: JSXOpeningElement[] = []
  new Visitor({JSXOpeningElement: (node) => void openings.push(node)}).visit(program)
  return openings
}

function importedComponents(program: Program): Set<string> {
  return new Set(
    program.body
      .filter((statement): statement is ImportDeclaration => statement.type === 'ImportDeclaration')
      .filter((statement) => !frameworkPackage(statement.source.value))
      .flatMap((statement) => statement.specifiers)
      .map((specifier) => specifier.local.name),
  )
}

function frameworkPackage(specifier: string): boolean {
  return FRAMEWORK_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

export function hostElement(name: JSXElementName): boolean {
  const first = name.type === 'JSXIdentifier' ? name.name.charAt(0) : ''
  return first !== first.toUpperCase()
}

export function calledComponent(node: JSXOpeningElement, imported: Set<string>): boolean {
  if (hostElement(node.name) || readAttribute(node, SITE_ATTRIBUTE) !== undefined) return false
  return imported.has(tagRoot(node.name))
}

function tagRoot(name: JSXElementName | JSXMemberExpressionObject): string {
  if (name.type === 'JSXIdentifier') return name.name
  if (name.type === 'JSXMemberExpression') return tagRoot(name.object)
  return ''
}

export function readAttribute(node: JSXOpeningElement, name: string) {
  return node.attributes.find(
    (candidate) =>
      candidate.type === 'JSXAttribute' && candidate.name.type === 'JSXIdentifier' && candidate.name.name === name,
  )
}

export function literalKey(node: JSXOpeningElement | undefined): string | null {
  if (node === undefined) return null
  const found = readAttribute(node, KEY_ATTRIBUTE)
  const value = found?.type === 'JSXAttribute' ? found.value : null
  return value?.type === 'Literal' && value.value !== '' ? value.value : null
}

export function insertAt(node: JSXOpeningElement): number {
  return Math.max(node.name.end, node.typeArguments?.end ?? 0, ...node.attributes.map((each) => each.end))
}

export function makeLocator(code: string): Locate {
  const starts = [0, ...[...code.matchAll(/\n/g)].map((match) => match.index + 1)]
  return (offset) => starts.findLastIndex((start) => start <= offset) + 1
}
