import {createSignal, createEffect, createRoot, Show, onCleanup, type JSX} from 'solid-js'
import {createKeyHold} from '@tanstack/solid-hotkeys'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'

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

type OpenResult = 'opened' | 'no-source' | 'failed'
const OPEN_RESULT: Record<OpenResult, {tone: 'success' | 'error'; label: (target: string) => string}> = {
  opened: {tone: 'success', label: (t) => `Opened ${t}`},
  'no-source': {tone: 'error', label: () => 'No source for this element'},
  failed: {tone: 'error', label: () => 'Couldn’t open'},
}

function HighlightInspector(ctx: EffectCtx): JSX.Element {
  const [hovered, setHovered] = createSignal<Hovered | null>(null)
  let lastX = -1
  let lastY = -1

  const resolve = (x: number, y: number) => {
    lastX = x
    lastY = y
    const el = ctx.page.elementAt(x, y)
    const target = el?.closest(SRC_SELECTOR) ?? el
    if (!target) return setHovered(null)
    const {file} = ctx.page.describe(target)
    setHovered({rect: target.getBoundingClientRect(), tag: target.tagName.toLowerCase(), file, host: target})
  }

  const onMove = (e: PointerEvent) => resolve(e.clientX, e.clientY)

  const onClick = async (e: MouseEvent) => {
    const h = hovered()
    if (!h) return
    e.preventDefault()
    e.stopPropagation()
    const loc = await ctx.page.locate(h.host)
    const r = loc ? await ctx.openSource(loc) : 'no-source'
    const out = OPEN_RESULT[r]
    ctx.toast(out.label(h.file ?? h.tag), out.tone)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') ctx.disable()
  }

  let raf = 0
  const reposition = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => resolve(lastX, lastY))
  }

  ctx.env.win.addEventListener('pointermove', onMove, true)
  ctx.env.win.addEventListener('click', onClick, true)
  ctx.env.win.addEventListener('keydown', onKey, true)
  ctx.env.win.addEventListener('scroll', reposition, true)
  ctx.env.win.addEventListener('resize', reposition)
  onCleanup(() => {
    cancelAnimationFrame(raf)
    ctx.env.win.removeEventListener('pointermove', onMove, true)
    ctx.env.win.removeEventListener('click', onClick, true)
    ctx.env.win.removeEventListener('keydown', onKey, true)
    ctx.env.win.removeEventListener('scroll', reposition, true)
    ctx.env.win.removeEventListener('resize', reposition)
  })

  const glide = ctx.env.reducedMotion() ? '' : GLIDE

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
                <span class="text-[0.6875rem] text-pw-text-2 font-pw-mono text-ellipsis overflow-hidden">
                  {h().file}
                </span>
              </Show>
            </div>
          </>
        )}
      </Show>
    </>
  )
}

export const highlightEffect = defineEffect({
  name: 'highlight',
  label: 'Highlight',
  description: 'Outline the element under the cursor; the user clicks one to open its exact source line in the editor.',
  render: HighlightInspector,
  setup: (ctx) =>
    createRoot((dispose) => {
      const altHeld = createKeyHold('Alt')
      let ownedByHotkey = false
      createEffect(() => {
        if (altHeld() && !isEditing()) {
          if (!ctx.isEnabled()) {
            ownedByHotkey = true
            ctx.enable()
          }
        } else if (ownedByHotkey) {
          ownedByHotkey = false
          ctx.disable()
        }
      })
      return dispose
    }),
})
