import {createSignal, createEffect, createRoot, Show, onCleanup, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {createKeyHold} from '@tanstack/solid-hotkeys'
import {defineExtension, type ClientApi} from '@mandarax/extension'
import type {OpenSourceResult} from '@mandarax/protocol/page-types'

// The built-in highlight-to-open-inspector extension, bundled with the widget. Holding Alt outlines the
// element under the cursor; clicking opens its exact source line in the editor. Lives entirely in a
// .client() phase (runs at widget mount, server-independent) reading the page capabilities off
// useClientApi() — no effect primitive, no page verb.

type Hovered = {rect: DOMRect; tag: string; file: string | null; host: Element}

const isEditing = (): boolean => {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

const SRC_SELECTOR = '[data-mandarax-source],[data-tsd-source]'
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

function HighlightInspector(props: {api: ClientApi; onExit: () => void}): JSX.Element {
  const {page, openSource, toast, env} = props.api
  const [hovered, setHovered] = createSignal<Hovered | null>(null)
  let lastX = -1
  let lastY = -1

  const resolve = (x: number, y: number) => {
    lastX = x
    lastY = y
    const el = page.elementAt(x, y)
    const target = el?.closest(SRC_SELECTOR) ?? el
    if (!target) return setHovered(null)
    const {file} = page.describe(target)
    setHovered({rect: target.getBoundingClientRect(), tag: target.tagName.toLowerCase(), file, host: target})
  }

  const onMove = (e: PointerEvent) => resolve(e.clientX, e.clientY)

  const onClick = async (e: MouseEvent) => {
    const h = hovered()
    if (!h) return
    e.preventDefault()
    e.stopPropagation()
    const loc = await page.locate(h.host)
    const result = loc ? await openSource(loc) : 'no-source'
    const out = OPEN_RESULT[result]
    toast(out.label(h.file ?? h.tag), out.tone)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onExit()
  }

  let raf = 0
  const reposition = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => resolve(lastX, lastY))
  }

  env.win.addEventListener('pointermove', onMove, true)
  env.win.addEventListener('click', onClick, true)
  env.win.addEventListener('keydown', onKey, true)
  env.win.addEventListener('scroll', reposition, true)
  env.win.addEventListener('resize', reposition)
  onCleanup(() => {
    cancelAnimationFrame(raf)
    env.win.removeEventListener('pointermove', onMove, true)
    env.win.removeEventListener('click', onClick, true)
    env.win.removeEventListener('keydown', onKey, true)
    env.win.removeEventListener('scroll', reposition, true)
    env.win.removeEventListener('resize', reposition)
  })

  const glide = env.reducedMotion() ? '' : GLIDE

  return (
    <>
      <div data-mandarax-capture class="cursor-crosshair inset-0 fixed" />
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
                <span class="text-[0.6875rem] text-pw-text-2 font-pw-mono text-ellipsis overflow-hidden">{h().file}</span>
              </Show>
            </div>
          </>
        )}
      </Show>
    </>
  )
}

const highlight = defineExtension({name: 'highlight'})

// Alt-hold drives an overlay rendered into the shared surface; click opens source, Esc exits. The whole
// lifecycle is the client phase — no Component, so it runs at mount whether or not the chat server is up.
highlight.client(() =>
  createRoot((dispose) => {
    const api = highlight.useClientApi()
    const surface = api.surface()
    let disposeOverlay: (() => void) | undefined
    const disable = () => {
      disposeOverlay?.()
      disposeOverlay = undefined
    }
    const enable = () => {
      if (!disposeOverlay) disposeOverlay = render(() => <HighlightInspector api={api} onExit={disable} />, surface)
    }
    const altHeld = createKeyHold('Alt')
    let ownedByHotkey = false
    createEffect(() => {
      if (altHeld() && !isEditing()) {
        if (!disposeOverlay) {
          ownedByHotkey = true
          enable()
        }
      } else if (ownedByHotkey) {
        ownedByHotkey = false
        disable()
      }
    })
    onCleanup(disable)
    return {value: {}, dispose}
  }),
)

declare module '@mandarax/extension' {
  interface Register {
    highlight: {context: Record<never, never>}
  }
}

export default highlight
