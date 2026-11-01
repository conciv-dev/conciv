import {Visitor, type JSXChild, type JSXElement, type JSXExpression} from 'oxc-parser'
import type {LiveRole} from '../shared/roles.js'
import type {RoleRules, SourceLoc} from '../shared/types.js'
import {readSite} from './provenance/jsx.js'

const WRAPPERS: Record<string, string> = {'[': ']', '{': '}'}
const LOREM = 'lorem ipsum'
const GROUPING = new Set([',', '.', ' ', ' ', ' ', "'"])
const SIGNS = new Set(['+', '-', '−'])
const DATE_SEPARATORS = new Set(['/', '-', '.'])
const IDENTIFIER_JOINS = new Set(['-', '_', '#', '/'])
const CURRENCY_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x24, 0x24],
  [0xa2, 0xa5],
  [0x20a0, 0x20cf],
]
const DATE_PARTS = 3

function codePoint(character: string): number {
  return character.codePointAt(0) ?? 0
}

function isDigit(character: string): boolean {
  const point = codePoint(character)
  return point >= 0x30 && point <= 0x39
}

function isLetter(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase()
}

function isCurrency(character: string): boolean {
  const point = codePoint(character)
  return CURRENCY_RANGES.some(([low, high]) => point >= low && point <= high)
}

function unsigned(text: string): string {
  const [first = ''] = text
  return SIGNS.has(first) ? text.slice(1) : text
}

function isNumber(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = '', ...rest] = characters
  const last = characters.at(-1) ?? ''
  return isDigit(first) && isDigit(last) && rest.every((character) => isDigit(character) || GROUPING.has(character))
}

function isCurrencyAmount(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = ''] = characters
  const last = characters.at(-1) ?? ''
  if (isCurrency(first)) return isNumber(characters.slice(1).join('').trim())
  if (isCurrency(last)) return isNumber(characters.slice(0, -1).join('').trim())
  return false
}

function isPercentage(text: string): boolean {
  return text.endsWith('%') && isNumber(text.slice(0, -1).trim())
}

function isDate(text: string): boolean {
  const characters = [...text]
  const separator = characters.find((character) => DATE_SEPARATORS.has(character))
  if (separator === undefined) return false
  const fields = text.split(separator)
  return fields.length === DATE_PARTS && fields.every((field) => field !== '' && [...field].every(isDigit))
}

function isIdentifier(text: string): boolean {
  const characters = [...text]
  const allowed = characters.every(
    (character) => isDigit(character) || isLetter(character) || IDENTIFIER_JOINS.has(character),
  )
  return allowed && characters.some(isDigit) && characters.some((character) => !isDigit(character))
}

function isPlaceholder(text: string): boolean {
  const [first = ''] = text
  const closing = WRAPPERS[first]
  if (closing !== undefined && text.length > 2 && text.endsWith(closing)) return true
  return text.toLowerCase().includes(LOREM)
}

function isData(text: string): boolean {
  return isCurrencyAmount(text) || isPercentage(text) || isDate(text) || isNumber(text) || isIdentifier(text)
}

export const roleRules: RoleRules = ({text}) => {
  const trimmed = text.trim()
  if (isPlaceholder(trimmed)) return {role: 'placeholder', confidence: 1}
  if (isData(trimmed)) return {role: 'data', confidence: 1}
  return {role: 'unknown', confidence: 0}
}

export type LiveText = {role: LiveRole; literals: string[]}

type Parts = {literals: string[]; expressions: number}

const NONE: Parts = {literals: [], expressions: 0}

function merged(all: Parts[]): Parts {
  return {
    literals: all.flatMap((part) => part.literals),
    expressions: all.reduce((sum, part) => sum + part.expressions, 0),
  }
}

function expressionParts(expression: JSXExpression): Parts {
  if (expression.type === 'JSXEmptyExpression') return NONE
  if (expression.type === 'Literal' && typeof expression.value === 'string') {
    return {literals: [expression.value.trim()], expressions: 0}
  }
  return {literals: [], expressions: 1}
}

function parts(child: JSXChild): Parts {
  switch (child.type) {
    case 'JSXText': {
      const text = child.value.trim()
      return text === '' ? NONE : {literals: [text], expressions: 0}
    }
    case 'JSXElement':
    case 'JSXFragment':
      return merged(child.children.map(parts))
    case 'JSXSpreadChild':
      return {literals: [], expressions: 1}
    case 'JSXExpressionContainer':
      return expressionParts(child.expression)
  }
}

function role(found: Parts): LiveRole | null {
  if (found.expressions > 0) return found.literals.length > 0 ? 'mixed' : 'expression'
  return found.literals.length > 0 ? 'literal' : null
}

export async function liveText(input: {cwd: string; source: SourceLoc | null}): Promise<LiveText | null> {
  const site = await readSite(input)
  if (site === null) return null
  const elements: JSXElement[] = []
  new Visitor({
    JSXElement(node) {
      if (node.openingElement.start === site.element.start) elements.push(node)
    },
  }).visit(site.program)
  const [element] = elements
  if (element === undefined) return null
  const found = merged(element.children.map(parts))
  const kind = role(found)
  return kind === null ? null : {role: kind, literals: found.literals}
}
