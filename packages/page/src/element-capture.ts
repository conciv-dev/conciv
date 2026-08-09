import {createMirror, serializeNodeWithId} from 'rrweb-snapshot'
import {isDangerousTag, neutralizeSubtree} from '@conciv/protocol/element-capture-sanitize'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {collectPendingCss, type PendingCssText} from './css-bundle.js'
import {elementDescriptor} from './element-descriptor.js'

const WIDGET_SELECTOR = '[data-conciv-root]'

const TARGET_MARKER = 'data-rr-target'

const MASKED_VALUE = '***'

const ANCESTOR_CAP = 24

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
