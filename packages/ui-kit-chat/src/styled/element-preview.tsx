import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  Show,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {createCache, createMirror, rebuildIntoSandboxedIframe} from 'rrweb-snapshot'
import {isDangerousTag, neutralizeSubtree} from '@conciv/protocol/element-capture-sanitize'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {Chip, ChipRow} from './chip.js'

type SerializedNode = Parameters<typeof rebuildIntoSandboxedIframe>[0]

type PreviewStatus = 'loading' | 'ready' | 'failed'

const TARGET_MARKER = 'data-rr-target'
const FRAME_PADDING = 12
const MAX_CROP_SCALE = 2
const NODE_TYPE_ELEMENT = 2
const ENTRANCE_MS = 200
const ENTRANCE_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const ENTRANCE_OFFSET = '0.25rem'

const REMOTE_CSS_URL_PATTERN = /url\(\s*["']?(?!data:)/i

const REPLICA_FRAME_ATTRIBUTES: Record<string, string> = {
  style: 'width:100%;height:100%;border:0;background:transparent',
  tabindex: '-1',
  'aria-hidden': 'true',
}

const FRAME_BASE =
  'relative w-full h-36 overflow-hidden contain-strict rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'
const FRAME_READY = `${FRAME_BASE} opacity-100`
const FRAME_LOADING = `${FRAME_BASE} anim-skel`
const FRAME_FAILED = `${FRAME_BASE} hidden`
const REPLICA_HOST = 'block w-full h-full'
const REPLICA_HOST_READY = `${REPLICA_HOST} visible`
const REPLICA_HOST_PENDING = `${REPLICA_HOST} invisible`

type ElementPreviewContextValue = {
  capture: Accessor<ElementCapture | undefined>
  css: Accessor<string | undefined>
  status: Accessor<PreviewStatus>
  setStatus: (status: PreviewStatus) => void
}

const ElementPreviewContext = createContext<ElementPreviewContextValue>()

function useElementPreviewContext(component: string): ElementPreviewContextValue {
  const ctx = useContext(ElementPreviewContext)
  if (ctx === undefined) throw new Error(`${component} must be rendered inside ElementPreview.Root`)
  return ctx
}

function isSerializedNode(value: unknown): value is SerializedNode {
  return typeof value === 'object' && value !== null && 'type' in value
}

function isElementNode(node: SerializedNode): boolean {
  if (!('tagName' in node)) return false
  const nodeType: number = node.type
  return nodeType === NODE_TYPE_ELEMENT
}

function Root(props: {capture?: ElementCapture; css?: string; children: JSX.Element}): JSX.Element {
  const [status, setStatus] = createSignal<PreviewStatus>(
    untrack(() => (props.capture?.node === undefined ? 'failed' : 'loading')),
  )
  const value: ElementPreviewContextValue = {
    capture: () => props.capture,
    css: () => props.css,
    status,
    setStatus,
  }
  return <ElementPreviewContext.Provider value={value}>{props.children}</ElementPreviewContext.Provider>
}

function cropToTarget(frame: Element, replicaRoot: HTMLElement, target: Element): boolean {
  const frameRect = frame.getBoundingClientRect()
  if (frameRect.width === 0 || frameRect.height === 0) return false
  replicaRoot.style.transform = 'none'
  const targetRect = target.getBoundingClientRect()
  const replicaRect = replicaRoot.getBoundingClientRect()
  if (targetRect.width === 0 || targetRect.height === 0) return false
  const dx = targetRect.left - replicaRect.left
  const dy = targetRect.top - replicaRect.top
  const availableWidth = Math.max(frameRect.width - FRAME_PADDING * 2, 1)
  const availableHeight = Math.max(frameRect.height - FRAME_PADDING * 2, 1)
  const scale = Math.min(availableWidth / targetRect.width, availableHeight / targetRect.height, MAX_CROP_SCALE)
  const translateX = -(dx - FRAME_PADDING / scale)
  const translateY = -(dy - FRAME_PADDING / scale)
  replicaRoot.style.transformOrigin = '0 0'
  replicaRoot.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`
  return true
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function playEntrance(frame: Element): void {
  if (prefersReducedMotion()) return
  frame.animate(
    [
      {opacity: 0, transform: `translateY(${ENTRANCE_OFFSET})`},
      {opacity: 1, transform: 'translateY(0)'},
    ],
    {duration: ENTRANCE_MS, easing: ENTRANCE_EASE, fill: 'none'},
  )
}

type Replica = {built: HTMLElement; target: Element; replicaDocument: Document}

function applySanitizedCss(replicaDocument: Document, cssText: string | undefined): void {
  const view = replicaDocument.defaultView
  if (view === null || cssText === undefined || cssText === '') return
  const sheet = new view.CSSStyleSheet()
  sheet.replaceSync(cssText)
  for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
    const rule = sheet.cssRules.item(index)
    if (rule !== null && REMOTE_CSS_URL_PATTERN.test(rule.cssText)) sheet.deleteRule(index)
  }
  replicaDocument.adoptedStyleSheets = [sheet]
}

function prepareReplicaDocument(iframe: HTMLIFrameElement, cssText: string | undefined): Document | null {
  const replicaDocument = iframe.contentDocument
  if (replicaDocument === null) return null
  replicaDocument.documentElement.style.background = 'transparent'
  replicaDocument.body.style.margin = '0'
  applySanitizedCss(replicaDocument, cssText)
  return replicaDocument
}

function mountReplica(replicaDocument: Document, built: Node | null): Replica | null {
  const view = replicaDocument.defaultView
  if (view === null || !(built instanceof view.HTMLElement)) return null
  built.inert = true
  built.style.pointerEvents = 'none'
  replicaDocument.body.appendChild(built)
  const target = built.matches(`[${TARGET_MARKER}]`) ? built : built.querySelector(`[${TARGET_MARKER}]`)
  return target === null ? null : {built, target, replicaDocument}
}

function rebuildIntoSandbox(host: HTMLDivElement, node: SerializedNode, cssText: string | undefined): Replica | null {
  if (!isElementNode(node) || isDangerousTag(node)) return null
  neutralizeSubtree(node)
  host.replaceChildren()
  const {iframe, node: built} = rebuildIntoSandboxedIframe(node, {
    root: host,
    mirror: createMirror(),
    cache: createCache(),
    iframeAttributes: REPLICA_FRAME_ATTRIBUTES,
  })
  const replicaDocument = prepareReplicaDocument(iframe, cssText)
  const replica = replicaDocument === null ? null : mountReplica(replicaDocument, built)
  if (replica === null) host.replaceChildren()
  return replica
}

function Frame(props: {class?: string}): JSX.Element {
  const ctx = useElementPreviewContext('ElementPreview.Frame')
  const [frameElement, setFrameElement] = createSignal<HTMLDivElement>()
  let replicaHost: HTMLDivElement | undefined
  let replica: Replica | undefined
  const label = (): string => {
    const descriptor = ctx.capture()?.descriptor
    return descriptor?.accessibleName ?? descriptor?.tagName ?? 'captured element'
  }
  const applyCrop = (frame: Element): void => {
    const current = replica
    if (current === undefined) return
    if (!cropToTarget(frame, current.built, current.target)) return
    ctx.setStatus('ready')
  }
  createEffect(() => {
    const node = ctx.capture()?.node
    const cssText = ctx.css()
    const frame = frameElement()
    ctx.setStatus('loading')
    replica = undefined
    if (replicaHost === undefined || !replicaHost.isConnected || !isSerializedNode(node)) {
      ctx.setStatus('failed')
      return
    }
    const built = rebuildIntoSandbox(replicaHost, structuredClone(node), cssText)
    if (built === null) {
      ctx.setStatus('failed')
      return
    }
    replica = built
    built.replicaDocument.fonts.ready.then(() => {
      if (replica !== built || frame === undefined) return
      applyCrop(frame)
    })
  })
  createResizeObserver(frameElement, (_rect, frame) => applyCrop(frame))
  createEffect(() => {
    if (ctx.status() !== 'ready') return
    const frame = frameElement()
    if (frame === undefined) return
    playEntrance(frame)
  })
  onCleanup(() => {
    replica = undefined
    replicaHost?.replaceChildren()
  })
  const frameClass = (): string => {
    const status = ctx.status()
    const base = status === 'ready' ? FRAME_READY : status === 'loading' ? FRAME_LOADING : FRAME_FAILED
    return `${base} ${props.class ?? ''}`
  }
  return (
    <div
      ref={setFrameElement}
      role={ctx.status() === 'failed' ? undefined : 'img'}
      aria-label={ctx.status() === 'failed' ? undefined : label()}
      aria-busy={ctx.status() === 'loading' ? 'true' : undefined}
      class={frameClass()}
    >
      <div
        ref={(node) => {
          replicaHost = node
        }}
        class={ctx.status() === 'ready' ? REPLICA_HOST_READY : REPLICA_HOST_PENDING}
      />
    </div>
  )
}

function Descriptor(props: {class?: string}): JSX.Element {
  const ctx = useElementPreviewContext('ElementPreview.Descriptor')
  const descriptor = () => (ctx.status() === 'failed' ? ctx.capture()?.descriptor : undefined)
  return (
    <Show when={descriptor()}>
      {(value) => (
        <ChipRow class={props.class}>
          <Show when={value().role}>{(role) => <Chip name="role" value={role()} />}</Show>
          <Show when={value().accessibleName}>{(name) => <Chip name="name" value={name()} />}</Show>
          <Show when={value().value}>{(fieldValue) => <Chip name="value" value={fieldValue()} />}</Show>
        </ChipRow>
      )}
    </Show>
  )
}

export const ElementPreview = {Root, Frame, Descriptor}
