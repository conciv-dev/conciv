import {createMirror, serializeNodeWithId} from 'rrweb-snapshot'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {collectPendingCss, type PendingCssText} from './css-bundle.js'
import {elementDescriptor} from './element-descriptor.js'

const WIDGET_SELECTOR = '[data-conciv-root]'

const TARGET_MARKER = 'data-rr-target'

const MASKED_VALUE = '***'

const ANCESTOR_CAP = 24

const DANGEROUS_TAGS = new Set(['iframe', 'object', 'embed'])

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'srcdoc', 'formaction'])

const JAVASCRIPT_SCHEME_PATTERN = /^javascript:/i

const CONTROL_AND_SPACE_PATTERN = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x20)}]`, 'g')

const NAMED_ENTITIES: Record<string, string> = {amp: '&', colon: ':', tab: '\t', newline: '\n'}

type SerializedNode = NonNullable<ReturnType<typeof serializeNodeWithId>>

function serializeOptions(doc: Document, skipChild: boolean): Parameters<typeof serializeNodeWithId>[1] {
  return {
    doc,
    mirror: createMirror(),
    blockClass: 'conciv-block',
    blockSelector: null,
    maskTextClass: 'conciv-mask',
    maskTextSelector: null,
    skipChild,
    inlineStylesheet: false,
    maskInputOptions: {password: true},
    maskTextFn: undefined,
    maskInputFn: undefined,
    slimDOMOptions: {script: true, comment: true},
    preserveWhiteSpace: false,
  }
}

function isSensitiveAttributes(attributes: Record<string, unknown>): boolean {
  const type = attributes['type']
  if (typeof type === 'string' && type.toLowerCase() === 'password') return true
  const autocomplete = attributes['autocomplete']
  if (typeof autocomplete !== 'string') return false
  const lowered = autocomplete.toLowerCase()
  return ['cc-', 'one-time-code', 'current-password', 'new-password'].some((token) => lowered.includes(token))
}

function scrubSensitiveValues(node: SerializedNode): void {
  if ('attributes' in node && isSensitiveAttributes(node.attributes)) node.attributes['value'] = MASKED_VALUE
  if (!('childNodes' in node)) return
  for (const child of node.childNodes) scrubSensitiveValues(child)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);?/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

function isJavascriptUrl(value: string): boolean {
  const stripped = decodeEntities(value).replace(CONTROL_AND_SPACE_PATTERN, '')
  return JAVASCRIPT_SCHEME_PATTERN.test(stripped)
}

function isDangerousTag(node: SerializedNode): boolean {
  return 'tagName' in node && DANGEROUS_TAGS.has(node.tagName.toLowerCase())
}

function neutralizeAttributes(attributes: Record<string, unknown>): void {
  for (const name of Object.keys(attributes)) {
    const lowered = name.toLowerCase()
    const value = attributes[name]
    if (lowered.startsWith('on')) {
      delete attributes[name]
      continue
    }
    if (URL_ATTRIBUTES.has(lowered) && typeof value === 'string' && isJavascriptUrl(value)) delete attributes[name]
  }
}

function neutralizeSubtree(node: SerializedNode): void {
  if ('attributes' in node) neutralizeAttributes(node.attributes)
  if (!('childNodes' in node)) return
  node.childNodes = node.childNodes.filter((child) => !isDangerousTag(child))
  for (const child of node.childNodes) neutralizeSubtree(child)
}

function markTarget(node: SerializedNode): void {
  if (!('attributes' in node)) return
  node.attributes[TARGET_MARKER] = 'true'
}

function withSingleChild(parent: SerializedNode, child: SerializedNode): SerializedNode | null {
  if (!('childNodes' in parent)) return null
  parent.childNodes = [child]
  return parent
}

function serializeWithAncestors(el: Element, doc: Document): SerializedNode | null {
  const target = serializeNodeWithId(el, serializeOptions(doc, false))
  if (target === null || isDangerousTag(target)) return null
  scrubSensitiveValues(target)
  markTarget(target)
  let chained = target
  let ancestor = el.parentElement
  let depth = 0
  while (ancestor !== null && depth < ANCESTOR_CAP) {
    const serialized = serializeNodeWithId(ancestor, serializeOptions(doc, true))
    if (serialized === null || isDangerousTag(serialized)) break
    const wrapped = withSingleChild(serialized, chained)
    if (wrapped === null) break
    chained = wrapped
    ancestor = ancestor.parentElement
    depth += 1
  }
  neutralizeSubtree(chained)
  return chained
}

function containsWidget(el: Element): boolean {
  if (el.matches(WIDGET_SELECTOR)) return true
  if (el.closest(WIDGET_SELECTOR) !== null) return true
  return el.querySelector(WIDGET_SELECTOR) !== null
}

export type CaptureDeps = {document: Document}

export type TakenCapture = {capture: ElementCapture; pendingCss: PendingCssText | null}

export function takeElementCapture(el: Element, kind: ElementCaptureKind, deps: CaptureDeps): TakenCapture | null {
  if (!el.isConnected) return null
  const descriptor = elementDescriptor(el)
  const ts = Date.now()
  if (containsWidget(el)) return {capture: {kind, ts, descriptor}, pendingCss: null}
  const node = serializeWithAncestors(el, deps.document)
  const pendingCss = collectPendingCss(deps.document)
  return {
    capture: {kind, ts, descriptor, ...(node === null ? {} : {node})},
    pendingCss,
  }
}
