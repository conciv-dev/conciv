import {Duration, Effect, Exit} from 'effect'
import type {createMirror, Mirror, serializeNodeWithId, stringifyStylesheet} from 'rrweb-snapshot'
import {CONCIV_UI_SELECTOR} from './conciv-ui.js'
import {isDangerousTag, neutralizeSubtree} from './element-capture-sanitize.js'
import type {ElementCapture, ElementCaptureKind, CssBundle, ElementDescriptor} from './element-capture-types.js'
import {MASKED_VALUE, readAccessibleName, readCheckedState, readRole, readValue} from './snapshot.js'
import {componentHostAt, describe, sourceFromAttr} from './react.js'

const TARGET_MARKER = 'data-rr-target'

const ANCESTOR_CAP = 24

const NODE_PAYLOAD_CAP_BYTES = 200_000

const INLINE_IMAGE_ATTRIBUTE = 'rr_dataURL'

const INLINE_IMAGE_MIME = 'image/webp'

const INLINE_IMAGE_QUALITY = 0.8

const INLINE_IMAGE_JSON_OVERHEAD = INLINE_IMAGE_ATTRIBUTE.length + 6

const SNAPSHOT_BLOCKED_MESSAGE = 'Element previews are off: a content blocker likely blocked rrweb-snapshot.'

type SerializedNode = NonNullable<ReturnType<typeof serializeNodeWithId>>

type SerializedElement = Extract<SerializedNode, {tagName: string}>

export type SnapshotLibrary = {
  createMirror: typeof createMirror
  serializeNodeWithId: typeof serializeNodeWithId
  stringifyStylesheet: typeof stringifyStylesheet
}

export function cacheImport<A>(load: () => Promise<A>): Effect.Effect<A> {
  return Effect.runSync(
    Effect.cachedWithTTL(Effect.promise(load), (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero)),
  )
}

export function makeSnapshotLoader(notify: (message: string) => void) {
  const load = cacheImport(() => import('rrweb-snapshot'))
  const state: {loaded: SnapshotLibrary | null; noticeShown: boolean} = {loaded: null, noticeShown: false}
  const warm = (): Promise<SnapshotLibrary | null> =>
    Effect.runPromise(
      load.pipe(
        Effect.map((library) => {
          state.loaded = library
          return library
        }),
        Effect.catchCause(() =>
          Effect.sync(() => {
            if (!state.noticeShown) notify(SNAPSHOT_BLOCKED_MESSAGE)
            state.noticeShown = true
            return null
          }),
        ),
      ),
    )
  return {warm, loaded: (): SnapshotLibrary | null => state.loaded}
}

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

function serializeWithAncestors(el: Element, doc: Document, snapshot: SnapshotLibrary): SerializedNode | null {
  const mirror = snapshot.createMirror()
  const target = snapshot.serializeNodeWithId(el, serializeOptions(doc, false, mirror))
  if (target === null || isDangerousTag(target)) return null
  scrubSensitiveValues(target)
  markTarget(target)
  let chained = target
  let ancestor = el.parentElement
  let depth = 0
  while (ancestor !== null && depth < ANCESTOR_CAP) {
    const serialized = snapshot.serializeNodeWithId(ancestor, serializeOptions(doc, true, mirror))
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
  if (el.matches(CONCIV_UI_SELECTOR)) return true
  if (el.closest(CONCIV_UI_SELECTOR) !== null) return true
  return el.querySelector(CONCIV_UI_SELECTOR) !== null
}

type CaptureDeps = {document: Document; snapshot: SnapshotLibrary | null}

type TakenCapture = {capture: ElementCapture; pendingCss: PendingCssText | null}

export function takeElementCapture(el: Element, kind: ElementCaptureKind, deps: CaptureDeps): TakenCapture | null {
  if (!el.isConnected) return null
  const descriptor = elementDescriptor(el)
  const ts = Date.now()
  if (deps.snapshot === null || containsWidget(el)) return {capture: {kind, ts, descriptor}, pendingCss: null}
  const node = serializeWithAncestors(el, deps.document, deps.snapshot)
  const pendingCss = collectPendingCss(deps.document, deps.snapshot.stringifyStylesheet)
  return {
    capture: {kind, ts, descriptor, ...(node === null ? {} : {node})},
    pendingCss,
  }
}

const CSS_BUNDLE_CAP = 512 * 1024

const HASH_HEX_LENGTH = 16

export type PendingCssText = {css: string}

type StylesheetText = typeof stringifyStylesheet

function collectCssText(doc: Document, stylesheetText: StylesheetText): string {
  const sheets: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    const text = stylesheetText(sheet)
    if (text === null || text === '') continue
    sheets.push(text)
  }
  return sheets.join('\n')
}

export function collectPendingCss(doc: Document, stylesheetText: StylesheetText): PendingCssText | null {
  const css = collectCssText(doc, stylesheetText)
  if (css === '' || new TextEncoder().encode(css).byteLength > CSS_BUNDLE_CAP) return null
  return {css}
}

async function hashCssText(css: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `css${hex.slice(0, HASH_HEX_LENGTH)}`
}

export async function toCssBundle(pending: PendingCssText): Promise<CssBundle> {
  return {hash: await hashCssText(pending.css), css: pending.css}
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

function buildSelectorPath(el: Element): string {
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

function describeComponent(el: Element): {componentName?: string; sourceFile?: string; sourceLine?: number} {
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
  const name = readAccessibleName(el)
  const value = readValue(el)
  const checked = readCheckedState(el)
  return {
    tagName: el.tagName.toLowerCase(),
    role: readRole(el),
    ...(name === '' ? {} : {accessibleName: name}),
    ...(value === undefined ? {} : {value}),
    ...(checked === undefined ? {} : {checked}),
    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    selectorPath: buildSelectorPath(el),
    ...describeComponent(el),
  }
}
