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
import {createCache, createMirror, rebuild} from 'rrweb-snapshot'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {Chip, ChipRow} from './chip.js'

type SerializedNode = Parameters<typeof rebuild>[0]

type PreviewStatus = 'loading' | 'ready' | 'failed'

const TARGET_MARKER = 'data-rr-target'
const FRAME_PADDING = 12
const MAX_CROP_SCALE = 2
const NODE_TYPE_ELEMENT = 2

const DANGEROUS_TAGS = new Set(['iframe', 'object', 'embed'])

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'srcdoc', 'formaction'])

const JAVASCRIPT_SCHEME_PATTERN = /^javascript:/i

const CONTROL_AND_SPACE_PATTERN = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x20)}]`, 'g')

const NAMED_ENTITIES: Record<string, string> = {amp: '&', colon: ':', tab: '\t', newline: '\n'}

const FRAME_BASE =
  'relative w-full h-36 overflow-hidden contain-strict rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'
const FRAME_READY = `${FRAME_BASE} opacity-100 anim-pop`
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
  if ('isCustom' in node) delete node.isCustom
  if ('attributes' in node) neutralizeAttributes(node.attributes)
  if (!('childNodes' in node)) return
  node.childNodes = node.childNodes.filter((child) => !isDangerousTag(child))
  for (const child of node.childNodes) neutralizeSubtree(child)
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
  const targetRect = target.getBoundingClientRect()
  const replicaRect = replicaRoot.getBoundingClientRect()
  const frameRect = frame.getBoundingClientRect()
  if (targetRect.width === 0 || targetRect.height === 0) return false
  if (frameRect.width === 0 || frameRect.height === 0) return false
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

type Replica = {built: HTMLElement; target: Element}

function rebuildIntoShadow(host: HTMLDivElement, node: SerializedNode, cssText: string | undefined): Replica | null {
  if (!isElementNode(node) || isDangerousTag(node)) return null
  neutralizeSubtree(node)
  const shadow = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  shadow.replaceChildren()
  const style = document.createElement('style')
  style.textContent = cssText ?? ''
  shadow.appendChild(style)
  const built = rebuild(node, {
    doc: document,
    mirror: createMirror(),
    cache: createCache(),
    UNSAFE_allowUnprotectedRebuild: true,
  })
  if (!(built instanceof HTMLElement)) return null
  built.inert = true
  built.style.pointerEvents = 'none'
  shadow.appendChild(built)
  const target = built.matches(`[${TARGET_MARKER}]`) ? built : built.querySelector(`[${TARGET_MARKER}]`)
  return target === null ? null : {built, target}
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
    if (replicaHost === undefined || !isSerializedNode(node)) {
      ctx.setStatus('failed')
      return
    }
    const built = rebuildIntoShadow(replicaHost, structuredClone(node), cssText)
    if (built === null) {
      ctx.setStatus('failed')
      return
    }
    replica = built
    document.fonts.ready.then(() => {
      if (replica !== built || frame === undefined) return
      applyCrop(frame)
    })
  })
  createResizeObserver(frameElement, (_rect, frame) => applyCrop(frame))
  onCleanup(() => {
    replica = undefined
    replicaHost?.shadowRoot?.replaceChildren()
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
