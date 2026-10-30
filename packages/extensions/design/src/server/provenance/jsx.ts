import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {parseSync, Visitor, type JSXAttribute, type JSXOpeningElement, type Program} from 'oxc-parser'
import type {Provenance, SourceLoc} from '../../shared/types.js'

export type Parsed = {code: string; program: Program}

export type Site = Parsed & {element: JSXOpeningElement}

export const UNKNOWN: Provenance = {via: 'unknown'}

export async function parseFile(path: string): Promise<Parsed | null> {
  const code = await readFile(path, 'utf8').catch(() => null)
  if (code === null) return null
  const lang = path.endsWith('.tsx') || path.endsWith('.jsx') ? 'tsx' : 'ts'
  const {program, errors} = parseSync(path, code, {sourceType: 'module', lang})
  if (errors.length > 0) return null
  return {code, program}
}

export function positionOf(input: {code: string; offset: number}): {line: number; column: number} {
  const before = input.code.slice(0, input.offset)
  return {line: before.split('\n').length, column: input.offset - before.lastIndexOf('\n')}
}

function offsetOf(input: {code: string; line: number; column: number}): number {
  const lines = input.code.split('\n').slice(0, input.line - 1)
  return lines.reduce((sum, line) => sum + line.length + 1, 0) + input.column - 1
}

export async function siteOf(input: {cwd: string; source: SourceLoc | null}): Promise<Site | null> {
  if (input.source === null) return null
  const parsed = await parseFile(join(input.cwd, input.source.file))
  if (parsed === null) return null
  const offset = offsetOf({code: parsed.code, line: input.source.line, column: input.source.column})
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

export function attributeOf(input: {element: JSXOpeningElement; name: string}): JSXAttribute | null {
  const found = input.element.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === input.name,
  )
  if (found === undefined || found.type !== 'JSXAttribute') return null
  return found
}

export function located(input: {site: Site; offset: number}): {line: number; column: number} {
  return positionOf({code: input.site.code, offset: input.offset})
}

export function camelToKebab(key: string): string {
  return [...key].map((char) => (char === char.toLowerCase() ? char : `-${char.toLowerCase()}`)).join('')
}
