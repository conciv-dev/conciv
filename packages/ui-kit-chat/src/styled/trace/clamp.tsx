import {batch, createSignal, splitProps, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeResizeObserver} from '@solid-primitives/resize-observer'
import {Button} from '@conciv/ui-kit-system'
import {FOCUS} from '../classes.js'

export type TraceClampSize = 'default' | 'tall'

export const CLAMP_LINES: Record<TraceClampSize, number> = {default: 11, tall: 17}

const MAX_HEIGHT: Record<TraceClampSize, string> = {
  default: '[max-height:var(--chat-trace-clamp)]',
  tall: '[max-height:var(--chat-trace-clamp-tall)]',
}

const VIEWPORT = 'relative min-w-0 overflow-hidden'
const VIEWPORT_LIVE = 'flex flex-col justify-end'
const YIELD_TO_CODE = '[&:has([data-code-surface])]:[max-height:none]'
const FADE_BASE = 'pointer-events-none absolute inset-inline-0 h-7'
const FADE_BOTTOM = `${FADE_BASE} bottom-0 [background:linear-gradient(to_top,var(--clamp-fade-from,var(--chat-frame-bg)),transparent)]`
const FADE_TOP = `${FADE_BASE} top-0 [background:linear-gradient(to_bottom,var(--clamp-fade-from,var(--chat-frame-bg)),transparent)]`
const FOOTER = 'flex min-w-0'
const REVEAL = `inline-flex items-center min-h-5 cursor-pointer text-chat-xs leading-none [font-family:var(--chat-mono)] text-chat-affordance hover:text-chat-text-hi trans-color-bg motion-reduce:[transition:none] ${FOCUS}`

const FALLBACK_LINE_HEIGHT = 18

type ClampMeasure = {viewportHeight: number; contentHeight: number; lineHeight: number}

export type Clamp = {
  expanded: Accessor<boolean>
  toggle: () => void
  hiddenLines: Accessor<number>
  overflowing: Accessor<boolean>
  mountViewport: (element: HTMLElement) => void
  observeContent: (element: HTMLElement) => void
}

function measureLineHeight(element: Element): number {
  const parsed = Number.parseFloat(getComputedStyle(element).lineHeight)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_LINE_HEIGHT
}

export function createClamp(options: {lines: () => number | undefined; shownLines: () => number}): Clamp {
  const [expanded, setExpanded] = createSignal(false)
  const [measured, setMeasured] = createStore<ClampMeasure>({
    viewportHeight: 0,
    contentHeight: 0,
    lineHeight: FALLBACK_LINE_HEIGHT,
  })
  const elements: {viewport?: HTMLElement} = {}
  const applyEntry = (entry: ResizeObserverEntry): void => {
    if (entry.target !== elements.viewport) return setMeasured('contentHeight', entry.contentRect.height)
    setMeasured({viewportHeight: entry.contentRect.height, lineHeight: measureLineHeight(entry.target)})
  }
  const {observe} = makeResizeObserver((entries) => batch(() => entries.forEach(applyEntry)))
  const declaredHiddenLines = () => Math.max(0, (options.lines() ?? 0) - options.shownLines())
  const measuredHiddenLines = () =>
    Math.floor(Math.max(0, measured.contentHeight - measured.viewportHeight) / measured.lineHeight)
  const hiddenLines = () => Math.max(declaredHiddenLines(), measuredHiddenLines())
  return {
    expanded,
    toggle: () => setExpanded(!expanded()),
    hiddenLines,
    overflowing: () => !expanded() && hiddenLines() > 0,
    mountViewport: (element) => {
      elements.viewport = element
      observe(element)
    },
    observeContent: observe,
  }
}

export function ClampFade(props: {clamp: Clamp; live?: boolean}): JSX.Element {
  return (
    <>
      {props.clamp.overflowing() ? (
        <span aria-hidden="true" class={props.live === true ? FADE_TOP : FADE_BOTTOM} />
      ) : undefined}
    </>
  )
}

export function TraceClamp(props: {
  children: JSX.Element
  lines?: number
  live?: boolean
  size?: TraceClampSize
  overflowLabel?: (hiddenLines: number) => string
}): JSX.Element {
  const [local] = splitProps(props, ['children', 'lines', 'live', 'size', 'overflowLabel'])
  const size = (): TraceClampSize => local.size ?? 'default'
  const clamp = createClamp({lines: () => local.lines, shownLines: () => CLAMP_LINES[size()]})
  const label = () => local.overflowLabel?.(clamp.hiddenLines()) ?? `… ${clamp.hiddenLines()} more lines`
  const viewportClass = () =>
    clamp.expanded()
      ? VIEWPORT
      : `${VIEWPORT} ${MAX_HEIGHT[size()]} ${YIELD_TO_CODE} ${local.live === true ? VIEWPORT_LIVE : ''}`
  return (
    <div class="flex flex-col gap-1 min-w-0">
      <div ref={clamp.mountViewport} class={viewportClass()}>
        <div ref={clamp.observeContent} class="min-w-0">
          {local.children}
        </div>
        <ClampFade clamp={clamp} live={local.live} />
      </div>
      {clamp.overflowing() || clamp.expanded() ? (
        <div class={FOOTER}>
          <Button variant="plain" size="none" class={REVEAL} aria-expanded={clamp.expanded()} onClick={clamp.toggle}>
            {clamp.expanded() ? 'show less' : label()}
          </Button>
        </div>
      ) : undefined}
    </div>
  )
}
