import {createSignal, createEffect, Show, onCleanup, type JSX} from 'solid-js'
import {createKeyHold} from '@tanstack/solid-hotkeys'
import {defineExtension} from '@conciv/extension'
import {openSource} from '@conciv/extension/client'
import {describe, locate, showToast, type Refs} from '@conciv/page'
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
const GLIDE = 'transition-[left,top,width,height] duration-[80ms] ease-pw-ease'
const BOX =
  'fixed pointer-events-none rounded-pw-sm bg-pw-accent-08 [outline:2px_solid_var(--pw-accent)] shadow-[0_0_0_1px_var(--pw-accent-line),0_0_16px_var(--pw-accent-20)]'
const LABEL =
  'fixed pointer-events-none inline-flex items-baseline gap-1.5 max-w-[80vw] whitespace-nowrap -translate-y-full -mt-1 px-2.5 py-1 rounded-pw-md bg-pw-panel border border-pw-line shadow-pw-lg'
const HINT =
  'fixed top-3 left-1/2 -translate-x-1/2 pointer-events-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pw-pill bg-pw-panel text-pw-text-2 border border-pw-line shadow-pw-lg text-xs'

const OPEN_RESULT: Record<OpenSourceResult, {tone: 'success' | 'error'; label: (target: string) => string}> = {
  opened: {tone: 'success', label: (t) => `Opened ${t}`},
  'no-source': {tone: 'error', label: () => 'No source for this element'},
  failed: {tone: 'error', label: () => 'Couldn’t open'},
}

function HighlightInspector(props: {onExit: () => void}): JSX.Element {
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
    const loc = await locate(h.host, refs)
    const result = loc ? await openSource(resolveApiBase(), loc) : 'no-source'
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

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  onCleanup(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', reposition, true)
    window.removeEventListener('resize', reposition)
  })

  const glide = matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : GLIDE

  return (
    <div aria-hidden="true" class="contents">
      <div data-conciv-capture class="cursor-crosshair inset-0 fixed" />
      <div class={HINT}>
        Inspecting · click to open source ·{' '}
        <kbd class="text-[0.6875rem] text-pw-text-hi px-1 py-px border border-pw-line-2 rounded-pw-sm [font-family:inherit]">
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
                left: `${h().rect.left}px`,
                top: `${h().rect.top}px`,
                width: `${h().rect.width}px`,
                height: `${h().rect.height}px`,
              }}
            />
            <div class={`${LABEL}  ${glide}`} style={{left: `${h().rect.left}px`, top: `${h().rect.top}px`}}>
              <span class="text-[0.6875rem] text-pw-accent font-pw-mono font-semibold">{`<${h().tag}>`}</span>
              <Show when={h().file}>
                <span class="text-[0.6875rem] text-pw-text-2 font-pw-mono text-ellipsis overflow-hidden">
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
  const altHeld = createKeyHold('Alt')
  const [active, setActive] = createSignal(false)
  createEffect(() => {
    if (!altHeld()) return setActive(false)
    if (!isEditing()) setActive(true)
  })
  return (
    <Show when={active()}>
      <HighlightInspector onExit={() => setActive(false)} />
    </Show>
  )
}

const highlight = defineExtension({name: 'highlight', Surface: HighlightSurface})

declare module '@conciv/extension' {
  interface Register {
    highlight: {context: Record<never, never>}
  }
}

export default highlight
