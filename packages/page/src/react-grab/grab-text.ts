import {composeGrabText} from '@conciv/grab'
import type {SourceLoc} from '@conciv/protocol/page-introspect-types'
import {sourceFromAttr} from '../source-attr.js'

const MAX_TEXT = 80
const MAX_CLASS = 60
const NAMED_ATTRS = ['id', 'role', 'aria-label']
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

function salientAttributes(element: Element): string {
  const parts = NAMED_ATTRS.flatMap((name) => {
    const value = element.getAttribute(name)
    return value ? [`${name}="${collapse(value)}"`] : []
  })
  const className = collapse(element.getAttribute('class') ?? '')
  if (className) parts.push(`class="${truncate(className, MAX_CLASS)}"`)
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

export function elementSnippet(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const open = `<${tag}${salientAttributes(element)}>`
  if (VOID_TAGS.has(tag)) return open
  const text = truncate(collapse(element.textContent ?? ''), MAX_TEXT)
  if (!text) return open
  return `${open}${text}</${tag}>`
}

export function groundGrabText(
  element: Element,
  fallback: string,
): {snippet: string; source: SourceLoc | null; text: string} {
  const snippet = elementSnippet(element)
  const source = sourceFromAttr(element)
  return {snippet, source, text: composeGrabText(snippet, source, fallback)}
}
