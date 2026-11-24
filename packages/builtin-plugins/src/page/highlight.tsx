import {Effect} from 'effect'
import {Show, createMemo, onCleanup, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createKeyHold} from '@tanstack/solid-hotkeys'
import {render} from 'solid-js/web'
import {Kbd, prefersReducedMotion} from '@conciv/ui-kit-system'
import {addRef, type Refs} from './snapshot.js'
import {describe, locate} from './react.js'
import type {PageEffect} from './operations.js'
import {CONCIV_UI_SELECTOR} from './conciv-ui.js'
import {openSource, type OpenedSource, type SourceOpener} from './open-source.js'

export type HighlightOptions = {
  opener: Omit<SourceOpener, 'locate'>
  toast: (title: string, variant: 'success' | 'error') => void
}

type Hovered = {rect: DOMRect; tag: string; file: string | null; host: Element}

type AltPress = {id: symbol; whileEditing: boolean}

const SRC_SELECTOR = '[data-tsd-source]'
const GLIDE = 'transition-transform duration-[80ms] ease-chat'
const BOX =
  'fixed left-0 top-0 pointer-events-none rounded-chat-surface-sm bg-chat-accent-08 [outline:2px_solid_var(--chat-accent)] shadow-[0_0_0_1px_var(--chat-accent-line),0_0_16px_var(--chat-accent-20)]'
const LABEL =
  'fixed left-0 top-0 pointer-events-none inline-flex items-baseline gap-1.5 max-w-[80vw] whitespace-nowrap -mt-1 px-2.5 py-1 rounded-chat-surface-md bg-chat-panel border border-chat-line shadow-chat-lg'
const HINT =
  'fixed top-3 left-1/2 -translate-x-1/2 pointer-events-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chat-pill bg-chat-panel text-chat-text-2 border border-chat-line shadow-chat-lg text-xs'

const OPEN_RESULT: Record<OpenedSource, {variant: 'success' | 'error'; label: (target: string) => string}> = {
  opened: {variant: 'success', label: (target) => `Opened ${target}`},
  'no-source': {variant: 'error', label: () => 'No source for this element'},
  failed: {variant: 'error', label: () => 'Couldn’t open'},
}

function elementAt(x: number, y: number): Element | null {
  return document.elementsFromPoint(x, y).find((element) => !element.closest(CONCIV_UI_SELECTOR)) ?? null
}

const isEditing = (): boolean => {
  const element = document.activeElement
  if (!(element instanceof HTMLElement)) return false
  return element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
}

function HighlightInspector(props: HighlightOptions & {onExit: () => void}): JSX.Element {
  const refs: Refs = {map: new Map(), n: 0}
  const [state, setState] = createStore<{hovered: Hovered | null}>({hovered: null})
  const last = {x: -1, y: -1}

  const resolve = (x: number, y: number) => {
    last.x = x
    last.y = y
    const element = elementAt(x, y)
    const target = element?.closest(SRC_SELECTOR) ?? element
    if (!target) return setState('hovered', null)
    const {file} = describe(target)
    setState('hovered', {rect: target.getBoundingClientRect(), tag: target.tagName.toLowerCase(), file, host: target})
  }

  const open = async (event: MouseEvent) => {
    const hovered = state.hovered
    if (!hovered) return
    event.preventDefault()
    event.stopPropagation()
    const opener = {...props.opener, locate: (element: Element) => locate(element, (ref) => addRef(ref, refs))}
    const result = await Effect.runPromise(openSource(opener, hovered.host))
    const out = OPEN_RESULT[result]
    props.toast(out.label(hovered.file ?? hovered.tag), out.variant)
  }

  const frame = {id: 0}
  const reposition = () => {
    cancelAnimationFrame(frame.id)
    frame.id = requestAnimationFrame(() => resolve(last.x, last.y))
  }

  makeEventListener(window, 'pointermove', (event) => resolve(event.clientX, event.clientY), true)
  makeEventListener(window, 'click', (event) => void open(event), true)
  makeEventListener(
    window,
    'keydown',
    (event) => {
      if (event.key === 'Escape') props.onExit()
    },
    true,
  )
  makeEventListener(window, 'scroll', reposition, true)
  makeEventListener(window, 'resize', reposition)
  onCleanup(() => cancelAnimationFrame(frame.id))

  const glide = prefersReducedMotion() ? '' : GLIDE

  return (
    <>
      <div aria-hidden="true" data-conciv-capture class="cursor-crosshair pointer-events-auto inset-0 fixed" />
      <div role="status" class={HINT}>
        Inspecting · click to open source · <Kbd>Esc</Kbd> to exit
      </div>
      <div aria-hidden="true" class="contents">
        <Show when={state.hovered}>
          {(hovered) => (
            <>
              <div
                class={`${BOX}  ${glide}`}
                style={{
                  transform: `translate(${hovered().rect.left}px, ${hovered().rect.top}px)`,
                  width: `${hovered().rect.width}px`,
                  height: `${hovered().rect.height}px`,
                }}
              />
              <div
                class={`${LABEL}  ${glide}`}
                style={{transform: `translate(${hovered().rect.left}px, ${hovered().rect.top}px) translateY(-100%)`}}
              >
                <span class="text-[0.6875rem] text-chat-accent font-chat-mono font-semibold">{`<${hovered().tag}>`}</span>
                <Show when={hovered().file}>
                  <span class="text-[0.6875rem] text-chat-text-2 font-chat-mono text-ellipsis overflow-hidden">
                    {hovered().file}
                  </span>
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </>
  )
}

export function makeHighlight(options: HighlightOptions): {
  effect: PageEffect
  mount: (element: HTMLElement) => () => void
} {
  const [state, setState] = createStore<{driven: boolean; exitedPress: symbol | null}>({
    driven: false,
    exitedPress: null,
  })

  const HighlightLayer = (): JSX.Element => {
    const altHeld = createKeyHold('Alt')
    const press = createMemo<AltPress | undefined>((previous) => {
      if (!altHeld()) return undefined
      return previous ?? {id: Symbol('alt press'), whileEditing: untrack(isEditing)}
    }, undefined)
    const inspecting = createMemo(() => {
      const current = press()
      return current !== undefined && !current.whileEditing && state.exitedPress !== current.id
    })
    const exit = () => setState({driven: false, exitedPress: press()?.id ?? null})

    return (
      <Show when={state.driven || inspecting()}>
        <HighlightInspector opener={options.opener} toast={options.toast} onExit={exit} />
      </Show>
    )
  }

  const mount = (element: HTMLElement) => render(() => <HighlightLayer />, element)

  return {
    effect: {
      name: 'highlight',
      description: 'outline the element under the pointer and open its source on click',
      set: (enabled) => setState('driven', enabled),
      enabled: () => state.driven,
    },
    mount,
  }
}
