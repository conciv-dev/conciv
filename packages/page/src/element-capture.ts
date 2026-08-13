import {createMirror, type Mirror, serializeNodeWithId} from 'rrweb-snapshot'
import {isDangerousTag, neutralizeSubtree} from '@conciv/protocol/element-capture-sanitize'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {collectPendingCss, type PendingCssText} from './css-bundle.js'
import {elementDescriptor} from './element-descriptor.js'

const WIDGET_SELECTOR = '[data-conciv-root]'

const TARGET_MARKER = 'data-rr-target'

const MASKED_VALUE = '***'

const ANCESTOR_CAP = 24

const NODE_PAYLOAD_CAP_BYTES = 200_000

const INLINE_IMAGE_ATTRIBUTE = 'rr_dataURL'

const INLINE_IMAGE_MIME = 'image/webp'

const INLINE_IMAGE_QUALITY = 0.8

const INLINE_IMAGE_JSON_OVERHEAD = INLINE_IMAGE_ATTRIBUTE.length + 6

type SerializedNode = NonNullable<ReturnType<typeof serializeNodeWithId>>

type SerializedElement = Extract<SerializedNode, {tagName: string}>

function serializeOptions(
  doc: Document,
  skipChild: boolean,
  mirror: Mirror,
): Parameters<typeof serializeNodeWithId>[1] {
  return {
    doc,
    mirror,
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

function collectImageNodes(node: SerializedNode, found: SerializedElement[]): void {
  if ('tagName' in node && node.tagName === 'img') found.push(node)
  if (!('childNodes' in node)) return
  for (const child of node.childNodes) collectImageNodes(child, found)
}

function inlinableLiveImage(node: SerializedElement, mirror: Mirror): HTMLImageElement | null {
  const live = mirror.getNode(node.id)
  if (!(live instanceof HTMLImageElement)) return null
  if (live.closest('.conciv-block') !== null) return null
  return live
}

function renderableSize(image: HTMLImageElement): {width: number; height: number} | null {
  if (!image.complete || image.naturalWidth === 0) return null
  if (image.width === 0 || image.height === 0) return null
  return {width: image.width, height: image.height}
}

function renderedImageDataUrl(image: HTMLImageElement): string | null {
  const size = renderableSize(image)
  if (size === null) return null
  const canvas = image.ownerDocument.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (context === null) return null
  try {
    context.drawImage(image, 0, 0, size.width, size.height)
    const dataUrl = canvas.toDataURL(INLINE_IMAGE_MIME, INLINE_IMAGE_QUALITY)
    return dataUrl.startsWith('data:image/') ? dataUrl : null
  } catch {
    return null
  }
}

function admittedDataUrl(live: HTMLImageElement, remainingBytes: number): string | null {
  const dataUrl = renderedImageDataUrl(live)
  if (dataUrl === null) return null
  if (dataUrl.length + INLINE_IMAGE_JSON_OVERHEAD > remainingBytes) return null
  return dataUrl
}

function inlineRenderedImages(tree: SerializedNode, mirror: Mirror, budgetBytes: number): void {
  const imageNodes: SerializedElement[] = []
  collectImageNodes(tree, imageNodes)
  let remainingBytes = budgetBytes
  for (const node of imageNodes) {
    const live = inlinableLiveImage(node, mirror)
    if (live === null) continue
    const dataUrl = admittedDataUrl(live, remainingBytes)
    if (dataUrl === null) continue
    remainingBytes -= dataUrl.length + INLINE_IMAGE_JSON_OVERHEAD
    node.attributes[INLINE_IMAGE_ATTRIBUTE] = dataUrl
  }
}

function serializeWithAncestors(el: Element, doc: Document): SerializedNode | null {
  const mirror = createMirror()
  const target = serializeNodeWithId(el, serializeOptions(doc, false, mirror))
  if (target === null || isDangerousTag(target)) return null
  scrubSensitiveValues(target)
  markTarget(target)
  let chained = target
  let ancestor = el.parentElement
  let depth = 0
  while (ancestor !== null && depth < ANCESTOR_CAP) {
    const serialized = serializeNodeWithId(ancestor, serializeOptions(doc, true, mirror))
    if (serialized === null || isDangerousTag(serialized)) break
    const wrapped = withSingleChild(serialized, chained)
    if (wrapped === null) break
    chained = wrapped
    ancestor = ancestor.parentElement
    depth += 1
  }
  neutralizeSubtree(chained)
  const baseBytes = new TextEncoder().encode(JSON.stringify(chained)).length
  if (baseBytes > NODE_PAYLOAD_CAP_BYTES) return null
  inlineRenderedImages(target, mirror, NODE_PAYLOAD_CAP_BYTES - baseBytes)
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
