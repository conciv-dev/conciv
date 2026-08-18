import {createSignal, onMount, Show, splitProps, type JSX} from 'solid-js'
import {makeResizeObserver} from '@solid-primitives/resize-observer'
import {Button} from '@conciv/ui-kit-system'
import {FOCUS} from '../classes.js'

export type TraceClampSize = 'default' | 'tall'

const CLAMP_LINES: Record<TraceClampSize, number> = {default: 11, tall: 17}

const MAX_HEIGHT: Record<TraceClampSize, string> = {
  default: '[max-height:var(--chat-trace-clamp,13rem)]',
  tall: '[max-height:var(--chat-trace-clamp-tall,20rem)]',
}

const VIEWPORT = 'relative min-w-0 overflow-hidden'
const VIEWPORT_LIVE = 'flex flex-col justify-end'
const FADE_BASE = 'pointer-events-none absolute inset-inline-0 h-7'
const FADE_BOTTOM = `${FADE_BASE} bottom-0 [background:linear-gradient(to_top,var(--chat-frame-bg),transparent)]`
const FADE_TOP = `${FADE_BASE} top-0 [background:linear-gradient(to_bottom,var(--chat-frame-bg),transparent)]`
const FOOTER = 'flex min-w-0 pt-1'
const REVEAL = `inline-flex items-center min-h-5 cursor-pointer text-[10.5px] leading-none [font-family:var(--chat-mono)] text-chat-affordance hover:text-chat-text-hi [transition:color_120ms_var(--chat-ease)] motion-reduce:[transition:none] ${FOCUS}`

const FALLBACK_LINE_HEIGHT = 18

function lineHeightOf(element: Element | undefined): number {
  if (!element) return FALLBACK_LINE_HEIGHT
  const parsed = Number.parseFloat(getComputedStyle(element).lineHeight)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_LINE_HEIGHT
}

export function TraceClamp(props: {
  children: JSX.Element
  lines?: number
  live?: boolean
  size?: TraceClampSize
  overflowLabel?: (hiddenLines: number) => string
}): JSX.Element {
  const [local] = splitProps(props, ['children', 'lines', 'live', 'size', 'overflowLabel'])
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const [expanded, setExpanded] = createSignal(false)
  const [measuredPixels, setMeasuredPixels] = createSignal(0)
  const size = (): TraceClampSize => local.size ?? 'default'
  const measure = (element: Element) => setMeasuredPixels(element.scrollHeight - element.clientHeight)
  const {observe} = makeResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) measure(entry.target)
  })
  const mountViewport = (element: HTMLDivElement) => {
    setViewport(element)
    observe(element)
    onMount(() => measure(element))
  }
  const declaredHiddenLines = () => Math.max(0, (local.lines ?? 0) - CLAMP_LINES[size()])
  const measuredHiddenLines = () => Math.round(measuredPixels() / lineHeightOf(viewport()))
  const hiddenLines = () => Math.max(declaredHiddenLines(), measuredHiddenLines())
  const overflowing = () => !expanded() && hiddenLines() > 0
  const label = () => local.overflowLabel?.(hiddenLines()) ?? `… ${hiddenLines()} more lines`
  const viewportClass = () =>
    expanded() ? VIEWPORT : `${VIEWPORT} ${MAX_HEIGHT[size()]} ${local.live === true ? VIEWPORT_LIVE : ''}`
  return (
    <div class="min-w-0">
      <div ref={mountViewport} class={viewportClass()}>
        <div class="min-w-0">{local.children}</div>
        <Show when={overflowing()}>
          <span aria-hidden="true" class={local.live === true ? FADE_TOP : FADE_BOTTOM} />
        </Show>
      </div>
      <Show when={overflowing() || expanded()}>
        <div class={FOOTER}>
          <Button
            variant="plain"
            size="none"
            class={REVEAL}
            aria-expanded={expanded()}
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? 'show less' : label()}
          </Button>
        </div>
      </Show>
    </div>
  )
}
