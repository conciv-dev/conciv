import type {DesignNode} from '../../shared/defs.js'

export function assignRoles(root: DesignNode): DesignNode {
  const children = root.children.map(assignRoles)
  if (root.kind !== 'text' || root.role !== undefined) return {...root, children}
  return {...root, role: roleOf(root.text), children}
}

type Role = Extract<DesignNode, {kind: 'text'}>['role']

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
const PERCENT = '%'

function roleOf(text: string): Role {
  const trimmed = text.trim()
  if (isPlaceholder(trimmed)) return 'placeholder'
  if (isData(trimmed)) return 'data'
  return 'unknown'
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

function isCurrencyAmount(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = ''] = characters
  const last = characters.at(-1) ?? ''
  if (isCurrency(first)) return isNumber(characters.slice(1).join('').trim())
  if (isCurrency(last)) return isNumber(characters.slice(0, -1).join('').trim())
  return false
}

function isPercentage(text: string): boolean {
  return text.endsWith(PERCENT) && isNumber(text.slice(0, -1).trim())
}

function isDate(text: string): boolean {
  const characters = [...text]
  const separator = characters.find((character) => DATE_SEPARATORS.has(character))
  if (separator === undefined) return false
  const fields = text.split(separator)
  return fields.length === DATE_PARTS && fields.every((field) => field !== '' && [...field].every(isDigit))
}

function isNumber(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = '', ...rest] = characters
  const last = characters.at(-1) ?? ''
  return isDigit(first) && isDigit(last) && rest.every((character) => isDigit(character) || GROUPING.has(character))
}

function isIdentifier(text: string): boolean {
  const characters = [...text]
  const allowed = characters.every(
    (character) => isDigit(character) || isLetter(character) || IDENTIFIER_JOINS.has(character),
  )
  return allowed && characters.some(isDigit) && characters.some((character) => !isDigit(character))
}

function unsigned(text: string): string {
  const [first = ''] = text
  return SIGNS.has(first) ? text.slice(1) : text
}

function isCurrency(character: string): boolean {
  const point = codePoint(character)
  return CURRENCY_RANGES.some(([low, high]) => point >= low && point <= high)
}

function isDigit(character: string): boolean {
  const point = codePoint(character)
  return point >= 0x30 && point <= 0x39
}

function isLetter(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase()
}

function codePoint(character: string): number {
  return character.codePointAt(0) ?? 0
}
