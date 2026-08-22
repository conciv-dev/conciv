import {createSignal, createEffect, Show, onCleanup, onMount, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createKeyHold} from '@tanstack/solid-hotkeys'
import {defineExtension, type RegisterExtension} from '@conciv/extension'
import {getHostApi} from '@conciv/extension/host'
import {openSource} from '@conciv/extension/client'
import {addRef, describe, locate, showToast, type Refs} from '@conciv/page'
import type {OpenSourceResult} from '@conciv/protocol/page-types'
import {elementAt} from '../lib/element-at.js'
import {resolveApiBase} from '../lib/api-base.js'

type Hovered = {rect: DOMRect; tag: string; file: string | null; host: Element}

const isEditing = (): boolean => {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}

const SRC_SELECTOR = '[data-conciv-source],[data-tsd-source]'
const GLIDE = 'transition-transform duration-[80ms] ease-chat'
const BOX =
  'fixed left-0 top-0 pointer-events-none rounded-chat-surface-sm bg-chat-accent-08 [outline:2px_solid_var(--chat-accent)] shadow-[0_0_0_1px_var(--chat-accent-line),0_0_16px_var(--chat-accent-20)]'
const LABEL =
  'fixed left-0 top-0 pointer-events-none inline-flex items-baseline gap-1.5 max-w-[80vw] whitespace-nowrap -mt-1 px-2.5 py-1 rounded-chat-surface-md bg-chat-panel border border-chat-line shadow-chat-lg'
const HINT =
  'fixed top-3 left-1/2 -translate-x-1/2 pointer-events-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chat-pill bg-chat-panel text-chat-text-2 border border-chat-line shadow-chat-lg text-xs'

const OPEN_RESULT: Record<OpenSourceResult, {tone: 'success' | 'error'; label: (target: string) => string}> = {
  opened: {tone: 'success', label: (t) => `Opened ${t}`},
  'no-source': {tone: 'error', label: () => 'No source for this element'},
  failed: {tone: 'error', label: () => 'Couldn’t open'},
}

function HighlightInspector(props: {onExit: () => void; session: () => string | null}): JSX.Element {
  const refs: Refs = {map: new Map(), n: 0}
  const [hovered, setHovered] = createSignal<Hovered | null>(null)
  let lastX = -1
  let lastY = -1

  const resolve = (x: number, y: number) => {
    lastX = x
    lastY = y
    const el = elementAt(x, y)
    const target = el?.closest(SRC_SELECTOR) ?? el
    if (!target) return setHovered(null)
    const {file} = describe(target)
    setHovered({rect: target.getBoundingClientRect(), tag: target.tagName.toLowerCase(), file, host: target})
  }

  const onMove = (e: PointerEvent) => resolve(e.clientX, e.clientY)

  const onClick = async (e: MouseEvent) => {
    const h = hovered()
    if (!h) return
    e.preventDefault()
    e.stopPropagation()
    const loc = await locate(h.host, (el) => addRef(el, refs))
    const result = loc ? await openSource(resolveApiBase(), loc, props.session) : 'no-source'
    const out = OPEN_RESULT[result]
    showToast(out.label(h.file ?? h.tag), out.tone)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onExit()
  }

  let raf = 0
  const reposition = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => resolve(lastX, lastY))
  }

  onMount(() => {
    const openHovered = (event: MouseEvent) => void onClick(event)
    const exitOnEscape = (event: KeyboardEvent) => onKey(event)
    makeEventListener(window, 'pointermove', onMove, true)
    makeEventListener(window, 'click', openHovered, true)
    makeEventListener(window, 'keydown', exitOnEscape, true)
    makeEventListener(window, 'scroll', reposition, true)
    makeEventListener(window, 'resize', reposition)
  })
  onCleanup(() => cancelAnimationFrame(raf))

  const glide = matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : GLIDE

  return (
    <div aria-hidden="true" class="contents">
      <div data-conciv-capture class="cursor-crosshair inset-0 fixed" />
      <div class={HINT}>
        Inspecting · click to open source ·{' '}
        <kbd class="text-[0.6875rem] text-chat-text-hi px-1 py-px border border-chat-line-2 rounded-chat-surface-sm [font-family:inherit]">
          Esc
        </kbd>{' '}
        to exit
      </div>
      <Show when={hovered()}>
        {(h) => (
          <>
            <div
              class={`${BOX}  ${glide}`}
              style={{
                transform: `translate(${h().rect.left}px, ${h().rect.top}px)`,
                width: `${h().rect.width}px`,
                height: `${h().rect.height}px`,
              }}
            />
            <div
              class={`${LABEL}  ${glide}`}
              style={{transform: `translate(${h().rect.left}px, ${h().rect.top}px) translateY(-100%)`}}
            >
              <span class="text-[0.6875rem] text-chat-accent font-chat-mono font-semibold">{`<${h().tag}>`}</span>
              <Show when={h().file}>
                <span class="text-[0.6875rem] text-chat-text-2 font-chat-mono text-ellipsis overflow-hidden">
                  {h().file}
                </span>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}

function HighlightSurface(): JSX.Element {
  const context = highlight.useContext()
  const sessionId = getHostApi().useSessionId()
  const altHeld = createKeyHold('Alt')
  const [held, setHeld] = createSignal(false)
  createEffect(() => {
    if (!altHeld()) return setHeld(false)
    if (!isEditing()) setHeld(true)
  })
  const active = () => held() || context.driven()
  const exit = () => {
    setHeld(false)
    context.setDriven(false)
  }
  return (
    <Show when={active()}>
      <HighlightInspector onExit={exit} session={sessionId} />
    </Show>
  )
}

const highlight = defineExtension({name: 'highlight', Surface: HighlightSurface}).client(() => {
  const [driven, setDriven] = createSignal(false)
  return {
    value: {driven, setDriven},
    effects: [
      {
        name: 'highlight',
        description: 'outline the element under the pointer and open its source on click',
        set: (enabled: boolean) => setDriven(enabled),
        enabled: driven,
      },
    ],
  }
})

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof highlight> {}
}

export default highlight
