import {createContext, createEffect, createSignal, onCleanup, Show, useContext, type Accessor, type JSX} from 'solid-js'
import {createCache, createMirror, rebuild} from 'rrweb-snapshot'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {Chip} from './chip.js'

type SerializedNode = Parameters<typeof rebuild>[0]

const TARGET_MARKER = 'data-rr-target'
const FRAME_PADDING = 12

const FRAME_BASE =
  'relative w-full h-36 overflow-hidden rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'
const FRAME_READY = `${FRAME_BASE} opacity-100 anim-pop`
const FRAME_LOADING = `${FRAME_BASE} opacity-0`
const DESCRIPTOR_ROOT = 'flex flex-wrap gap-1.5 m-0 p-0'

type ElementPreviewContextValue = {
  capture: Accessor<ElementCapture | undefined>
  css: Accessor<string | undefined>
  hasNode: Accessor<boolean>
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

function Root(props: {capture?: ElementCapture; css?: string; children: JSX.Element}): JSX.Element {
  const value: ElementPreviewContextValue = {
    capture: () => props.capture,
    css: () => props.css,
    hasNode: () => props.capture?.node !== undefined,
  }
  return <ElementPreviewContext.Provider value={value}>{props.children}</ElementPreviewContext.Provider>
}

function cropToTarget(host: HTMLElement, wrapper: HTMLElement, target: Element): void {
  const targetRect = target.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  if (targetRect.width === 0 || targetRect.height === 0 || hostRect.width === 0 || hostRect.height === 0) return
  const dx = targetRect.left - wrapperRect.left
  const dy = targetRect.top - wrapperRect.top
  const availableWidth = Math.max(hostRect.width - FRAME_PADDING * 2, 1)
  const availableHeight = Math.max(hostRect.height - FRAME_PADDING * 2, 1)
  const scale = Math.min(availableWidth / targetRect.width, availableHeight / targetRect.height)
  const translateX = -(dx - FRAME_PADDING / scale)
  const translateY = -(dy - FRAME_PADDING / scale)
  wrapper.style.transformOrigin = '0 0'
  wrapper.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`
}

function Frame(props: {class?: string}): JSX.Element {
  const ctx = useElementPreviewContext('ElementPreview.Frame')
  const [ready, setReady] = createSignal(false)
  let host: HTMLDivElement | undefined
  const label = (): string => {
    const descriptor = ctx.capture()?.descriptor
    return descriptor?.accessibleName ?? descriptor?.tagName ?? 'captured element'
  }
  createEffect(() => {
    const node = ctx.capture()?.node
    const cssText = ctx.css()
    setReady(false)
    if (host === undefined || !isSerializedNode(node)) return
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
    if (!(built instanceof HTMLElement)) return
    built.inert = true
    built.style.pointerEvents = 'none'
    shadow.appendChild(built)
    const target = built.matches(`[${TARGET_MARKER}]`) ? built : built.querySelector(`[${TARGET_MARKER}]`)
    if (target === null) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    document.fonts.ready.then(() => {
      if (cancelled || host === undefined) return
      cropToTarget(host, built, target)
      setReady(true)
    })
  })
  onCleanup(() => {
    host?.shadowRoot?.replaceChildren()
  })
  const frameClass = () => `${ready() ? FRAME_READY : FRAME_LOADING} ${props.class ?? ''}`
  return (
    <div
      ref={(node) => {
        host = node
      }}
      role="img"
      aria-label={label()}
      aria-busy={!ready()}
      class={frameClass()}
    />
  )
}

function Descriptor(props: {class?: string}): JSX.Element {
  const ctx = useElementPreviewContext('ElementPreview.Descriptor')
  const descriptor = () => ctx.capture()?.descriptor
  const rootClass = () => `${DESCRIPTOR_ROOT} ${props.class ?? ''}`
  return (
    <Show when={descriptor()}>
      {(value) => (
        <dl class={rootClass()}>
          <Show when={value().role}>{(role) => <Chip name="role" value={role()} />}</Show>
          <Show when={value().accessibleName}>{(name) => <Chip name="name" value={name()} />}</Show>
          <Show when={value().value}>{(fieldValue) => <Chip name="value" value={fieldValue()} />}</Show>
        </dl>
      )}
    </Show>
  )
}

export const ElementPreview = {Root, Frame, Descriptor}
