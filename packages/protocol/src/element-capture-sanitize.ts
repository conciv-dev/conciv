export type SanitizableNode = {
  type: number
  tagName?: string
  isCustom?: boolean
  attributes?: Record<string, unknown>
  childNodes?: SanitizableNode[]
}

const DANGEROUS_TAGS = new Set(['iframe', 'object', 'embed', 'script', 'link', 'style'])

const URL_ATTRIBUTES = new Set([
  'action',
  'background',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'srcdoc',
  'srcset',
  'xlink:href',
])

const LOCAL_REFERENCE_PATTERN = /^(?:#|data:)/i

const CSS_URL_PATTERN = /url\(|image-set\(/i

const CONTROL_AND_SPACE_PATTERN = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x20)}]`, 'g')

const HEX_ENTITY_PATTERN = /&#x([0-9a-f]+);?/gi

const DECIMAL_ENTITY_PATTERN = /&#(\d+);?/g

const NAMED_ENTITY_PATTERN = /&([a-z]+);?/gi

const NAMED_ENTITIES: Record<string, string> = {amp: '&', colon: ':', tab: '\t', newline: '\n'}

const MAX_CODE_POINT = 0x10ffff

function decodedCodePoint(digits: string, radix: number): string | undefined {
  const codePoint = Number.parseInt(digits, radix)
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) return undefined
  return String.fromCodePoint(codePoint)
}

export function decodeEntities(value: string): string | undefined {
  let decodable = true
  const decoded = value
    .replace(HEX_ENTITY_PATTERN, (match, hex: string) => {
      const character = decodedCodePoint(hex, 16)
      if (character === undefined) decodable = false
      return character ?? match
    })
    .replace(DECIMAL_ENTITY_PATTERN, (match, decimal: string) => {
      const character = decodedCodePoint(decimal, 10)
      if (character === undefined) decodable = false
      return character ?? match
    })
    .replace(NAMED_ENTITY_PATTERN, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
  return decodable ? decoded : undefined
}

export function isLocalReference(value: string): boolean {
  const decoded = decodeEntities(value)
  if (decoded === undefined) return false
  return LOCAL_REFERENCE_PATTERN.test(decoded.replace(CONTROL_AND_SPACE_PATTERN, ''))
}

export function isDangerousTag(node: SanitizableNode): boolean {
  return node.tagName !== undefined && DANGEROUS_TAGS.has(node.tagName.toLowerCase())
}

export function isDroppableAttribute(name: string, value: unknown): boolean {
  const lowered = name.toLowerCase()
  if (lowered.startsWith('on')) return true
  if (lowered === 'style') return typeof value === 'string' && CSS_URL_PATTERN.test(value)
  if (!URL_ATTRIBUTES.has(lowered)) return false
  return typeof value !== 'string' || !isLocalReference(value)
}

function neutralizeAttributes(attributes: Record<string, unknown>): void {
  for (const name of Object.keys(attributes)) {
    if (isDroppableAttribute(name, attributes[name])) delete attributes[name]
  }
}

export function neutralizeSubtree(node: SanitizableNode): void {
  delete node.isCustom
  if (node.attributes !== undefined) neutralizeAttributes(node.attributes)
  if (node.childNodes === undefined) return
  node.childNodes = node.childNodes.filter((child) => !isDangerousTag(child))
  for (const child of node.childNodes) neutralizeSubtree(child)
}
