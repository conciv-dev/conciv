import type {ElementDescriptor} from '@conciv/protocol/element-capture-types'
import {accessibleNameOf, checkedStateOf, roleOf, valueOf} from './page-snapshot.js'
import {componentHostAt, describe} from './react-bridge.js'
import {sourceFromAttr} from './source-attr.js'

export const MASKED_VALUE = '***'

const SENSITIVE_AUTOCOMPLETE = ['cc-', 'one-time-code', 'current-password', 'new-password']

export function isSensitiveField(el: Element): boolean {
  const type = el.getAttribute('type')?.toLowerCase() ?? ''
  if (type === 'password') return true
  const autocomplete = el.getAttribute('autocomplete')?.toLowerCase() ?? ''
  return SENSITIVE_AUTOCOMPLETE.some((token) => autocomplete.includes(token))
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id !== '') return `${tag}#${CSS.escape(el.id)}`
  const parent = el.parentElement
  if (parent === null) return tag
  const siblings = Array.from(parent.children).filter((child) => child.tagName === el.tagName)
  if (siblings.length === 1) return tag
  return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`
}

function selectorPathOf(el: Element): string {
  const segments: string[] = []
  let current: Element | null = el
  while (current !== null && current.tagName.toLowerCase() !== 'html') {
    const segment = segmentFor(current)
    segments.unshift(segment)
    if (segment.includes('#')) break
    current = current.parentElement
  }
  return segments.join(' > ')
}

function componentOf(el: Element): {componentName?: string; sourceFile?: string; sourceLine?: number} {
  const host = componentHostAt(el)
  if (host === null) return {}
  const described = describe(host)
  const source = sourceFromAttr(host)
  return {
    ...(described.component === '?' ? {} : {componentName: described.component}),
    ...(source === null ? {} : {sourceFile: source.file, sourceLine: source.line}),
  }
}

export function elementDescriptor(el: Element): ElementDescriptor {
  const rect = el.getBoundingClientRect()
  const name = accessibleNameOf(el)
  const rawValue = valueOf(el)
  const value = rawValue === undefined ? undefined : isSensitiveField(el) ? MASKED_VALUE : rawValue
  const checked = checkedStateOf(el)
  return {
    tagName: el.tagName.toLowerCase(),
    role: roleOf(el),
    ...(name === '' ? {} : {accessibleName: name}),
    ...(value === undefined ? {} : {value}),
    ...(checked === undefined ? {} : {checked}),
    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    selectorPath: selectorPathOf(el),
    ...componentOf(el),
  }
}
