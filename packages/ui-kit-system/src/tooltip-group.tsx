import {
  createContext,
  createSignal,
  createUniqueId,
  For,
  mergeProps,
  onMount,
  Show,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {createTimer} from '@solid-primitives/timer'
import {
  alongX,
  anchorPoint,
  EASE_OUT,
  labelGeometry,
  leanRotation,
  leanSettled,
  leanStep,
  popIn,
  popOut,
  springEasing,
  swapIn,
  swapOut,
  TRANSFORM_ORIGIN,
  type TooltipGeometry,
  type TooltipSide,
} from './tooltip-motion.js'
import {createFrameLoop, prefersReducedMotion, type Spring} from './motion.js'

export type TooltipGroupMember = {
  id: string
  side: Accessor<TooltipSide>
  gap: Accessor<number>
  trigger: Accessor<HTMLElement | undefined>
  label: Accessor<{children?: JSX.Element}>
  close: () => void
}

export type TooltipGroupApi = {
  labelId: string
  warm: Accessor<boolean>
  openDelay: Accessor<number>
  open: (member: TooltipGroupMember) => void
  close: (member: TooltipGroupMember) => void
  arm: (options: {member: TooltipGroupMember; duration: number}) => void
  disarm: (member: TooltipGroupMember) => void
  forget: (member: TooltipGroupMember) => void
}

export type TooltipGroupProps = {
  openDelay?: number
  warmWindow?: number
  travel?: number
  lean?: number
  fuse?: boolean
  children: JSX.Element
}

type Mode = 'cold' | 'warm' | 'instant' | 'move'
type Phase = 'idle' | 'open' | 'closing' | 'cooling'
type Layer = {
  id: string
  member: TooltipGroupMember
  mode: Mode
  direction: number
  across: boolean
  leaving: boolean
  element?: HTMLElement
}
type Arming = {member: TooltipGroupMember; duration: number}
type GroupState = {
  phase: Phase
  active: TooltipGroupMember | null
  instant: boolean
  layers: Layer[]
  arming: Arming | null
  geometry: TooltipGeometry
}

const LABEL_PADDING_X = 10
const LABEL_PADDING_Y = 6
const LABEL_BORDER = 0
const GLIDE_BOUNCE = 0.1
const REVIVE_DURATION = 120
const FUSE_INSET = 4
const FUSE_OFFSET = 4
const FUSE_THICKNESS = 2

const LABEL = 'fixed top-0 left-0 z-[2147483647] pointer-events-none block'
const BOX =
  'absolute inset-0 rounded-[8px] bg-chat-panel text-chat-text text-[12.5px] font-medium leading-[1.2] tracking-[-0.01em] [box-shadow:0_1px_2px_rgba(0,0,0,0.12),0_8px_24px_-8px_rgba(0,0,0,0.45)]'
const LAYER = 'absolute inset-0 flex items-center justify-center'
const TEXT = 'flex shrink-0 items-center justify-center w-max max-w-56 text-center'
const ARROW_BASE = 'absolute size-2 -m-1 rotate-45 rounded-[2px] bg-chat-panel'
const ARROW: Record<TooltipSide, string> = {
  top: `${ARROW_BASE} bottom-px`,
  bottom: `${ARROW_BASE} top-px`,
  left: `${ARROW_BASE} right-px`,
  right: `${ARROW_BASE} left-px`,
}
const FUSE = 'fixed top-0 left-0 z-[2147483647] pointer-events-none rounded-full bg-chat-accent'

const GroupContext = createContext<TooltipGroupApi>()

export function useTooltipGroup(): TooltipGroupApi | undefined {
  return useContext(GroupContext)
}

export function Timer(props: {delay: number; onDone: () => void}): JSX.Element {
  createTimer(
    () => props.onDone(),
    () => props.delay,
    setTimeout,
  )
  return undefined
}

function focusVisibleWithin(element: HTMLElement): boolean {
  const root = element.getRootNode()
  const active = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null
  return active !== null && element.contains(active) && active.matches(':focus-visible')
}

function pathHas(options: {event: Event; element: HTMLElement | undefined}): boolean {
  return options.element !== undefined && options.event.composedPath().includes(options.element)
}

function cancelAnimations(element: HTMLElement | undefined): void {
  element?.getAnimations().forEach((animation) => animation.cancel())
}

function pixels(value: string): number {
  return Number.parseFloat(value) || 0
}

function liveGeometry(options: {
  label: HTMLElement
  arrow: HTMLElement | undefined
  settled: TooltipGeometry
}): TooltipGeometry {
  if (options.label.getAnimations().length === 0) return options.settled
  const style = getComputedStyle(options.label)
  const [x = '0', y = '0'] = style.translate.split(' ')
  const arrowStyle = options.arrow ? getComputedStyle(options.arrow) : undefined
  const arrowAt = alongX(options.settled.side) ? arrowStyle?.left : arrowStyle?.top
  return {
    ...options.settled,
    x: pixels(x),
    y: pixels(y),
    width: pixels(style.width),
    height: pixels(style.height),
    arrow: arrowAt === undefined ? options.settled.arrow : pixels(arrowAt),
  }
}

function geometryFrame(geometry: TooltipGeometry): Keyframe {
  return {translate: `${geometry.x}px ${geometry.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px`}
}

function arrowFrame(geometry: TooltipGeometry): Keyframe {
  if (alongX(geometry.side)) return {left: `${geometry.arrow}px`}
  return {top: `${geometry.arrow}px`}
}

function fuseStyle(arming: Arming): JSX.CSSProperties {
  const side = arming.member.side()
  const rect = arming.member.trigger()?.getBoundingClientRect()
  if (!rect) return {display: 'none'}
  if (alongX(side))
    return {
      translate: `${rect.left + FUSE_INSET}px ${side === 'top' ? rect.top - FUSE_OFFSET : rect.bottom + FUSE_OFFSET - FUSE_THICKNESS}px`,
      width: `${Math.max(0, rect.width - FUSE_INSET * 2)}px`,
      height: `${FUSE_THICKNESS}px`,
      'transform-origin': 'left center',
    }
  return {
    translate: `${side === 'left' ? rect.left - FUSE_OFFSET : rect.right + FUSE_OFFSET - FUSE_THICKNESS}px ${rect.top + FUSE_INSET}px`,
    width: `${FUSE_THICKNESS}px`,
    height: `${Math.max(0, rect.height - FUSE_INSET * 2)}px`,
    'transform-origin': 'center top',
  }
}

function Fuse(props: {arming: Arming}): JSX.Element {
  const [element, setElement] = createSignal<HTMLElement>()
  onMount(() => {
    const horizontal = alongX(props.arming.member.side())
    element()?.animate([{scale: horizontal ? '0 1' : '1 0'}, {scale: '1 1'}], {
      duration: props.arming.duration,
      easing: 'linear',
    })
  })
  return <span ref={setElement} aria-hidden="true" class={FUSE} style={fuseStyle(props.arming)} />
}

function LayerView(props: {
  layer: Layer
  onReady: (options: {layer: Layer; element: HTMLElement; text: HTMLElement}) => void
  onResize: (options: {layer: Layer; text: HTMLElement}) => void
}): JSX.Element {
  const [element, setElement] = createSignal<HTMLElement>()
  const [text, setText] = createSignal<HTMLElement>()
  createResizeObserver(text, (_, target) => {
    if (target instanceof HTMLElement) props.onResize({layer: props.layer, text: target})
  })
  onMount(() => {
    const layerElement = element()
    const textElement = text()
    if (layerElement && textElement) props.onReady({layer: props.layer, element: layerElement, text: textElement})
  })
  return (
    <span ref={setElement} class={LAYER}>
      <span ref={setText} class={TEXT}>
        {props.layer.member.label().children}
      </span>
    </span>
  )
}

export function TooltipGroup(props: TooltipGroupProps): JSX.Element {
  const config = mergeProps({openDelay: 400, warmWindow: 300, travel: 320, lean: 0, fuse: false}, props)
  const labelId = `tooltip-group-${createUniqueId()}`
  const [label, setLabel] = createSignal<HTMLElement>()
  const [box, setBox] = createSignal<HTMLElement>()
  const [arrow, setArrow] = createSignal<HTMLElement>()
  const [state, setState] = createStore<GroupState>({
    phase: 'idle',
    active: null,
    instant: false,
    layers: [],
    arming: null,
    geometry: {x: 0, y: 0, width: 0, height: 0, arrow: 0, side: 'top'},
  })
  const visible = () => state.phase === 'open' || state.phase === 'closing'
  const cooling = () => state.phase === 'closing' || state.phase === 'cooling'
  const warm = () => state.phase !== 'idle'

  const finishClose = (): void => {
    cancelAnimations(box())
    setState({phase: 'cooling', active: null, instant: false, layers: [], arming: null})
  }

  const closeNow = (): void => {
    if (!visible()) return
    finishClose()
  }

  const revive = (): void => {
    const element = box()
    if (!element || element.getAnimations().length === 0) return
    const opacity = getComputedStyle(element).opacity
    cancelAnimations(element)
    if (prefersReducedMotion()) return
    element.animate([{opacity}, {opacity: '1'}], {duration: REVIVE_DURATION, easing: EASE_OUT})
  }

  const swapDirection = (options: {from: TooltipGroupMember | null; to: TooltipGroupMember}) => {
    const across = !alongX(options.to.side())
    const fromTrigger = options.from?.trigger()
    const toTrigger = options.to.trigger()
    if (!fromTrigger || !toTrigger) return {direction: 0, across}
    const before = anchorPoint({rect: fromTrigger.getBoundingClientRect(), side: options.from?.side() ?? 'top', gap: 0})
    const after = anchorPoint({rect: toTrigger.getBoundingClientRect(), side: options.to.side(), gap: 0})
    return {direction: Math.sign(across ? after.y - before.y : after.x - before.x) || 1, across}
  }

  const dropLayer = (id: string): void => {
    setState('layers', (layers) => layers.filter((item) => item.id !== id))
  }

  const leave = (options: {outgoing: Layer; direction: number; across: boolean}): void => {
    const {outgoing, direction, across} = options
    const element = outgoing.element
    if (!element) {
      dropLayer(outgoing.id)
      return
    }
    setState('layers', (item) => item.id === outgoing.id, 'leaving', true)
    cancelAnimations(element)
    swapOut({element, direction, across}).onfinish = () => dropLayer(outgoing.id)
  }

  const openMode = (options: {instant: boolean; shown: boolean}): Mode => {
    if (options.instant) return 'instant'
    if (options.shown) return 'move'
    if (state.phase === 'cooling') return 'warm'
    return 'cold'
  }

  const open = (member: TooltipGroupMember): void => {
    const trigger = member.trigger()
    const shown = visible()
    const instant = trigger !== undefined && focusVisibleWithin(trigger)
    if (shown) revive()
    if (shown && state.active?.id === member.id) {
      setState({phase: 'open', arming: null, instant})
      return
    }
    const mode = openMode({instant, shown})
    if (mode === 'move' && !prefersReducedMotion()) {
      swapTo(member)
      return
    }
    setState({phase: 'open', active: member, instant, arming: null})
    setState('layers', [{id: createUniqueId(), member, mode, leaving: false, direction: 0, across: false}])
  }

  const swapTo = (member: TooltipGroupMember): void => {
    const swap = swapDirection({from: state.active, to: member})
    const layer: Layer = {id: createUniqueId(), member, mode: 'move', leaving: false, ...swap}
    state.layers.filter((outgoing) => !outgoing.leaving).forEach((outgoing) => leave({outgoing, ...swap}))
    setState({phase: 'open', active: member, instant: false, arming: null})
    setState('layers', (layers) => [...layers.filter((item) => item.leaving), layer])
  }

  const measure = (options: {member: TooltipGroupMember; trigger: HTMLElement; text: HTMLElement}): TooltipGeometry =>
    labelGeometry({
      anchor: anchorPoint({
        rect: options.trigger.getBoundingClientRect(),
        side: options.member.side(),
        gap: options.member.gap(),
      }),
      width: options.text.offsetWidth + (LABEL_PADDING_X + LABEL_BORDER) * 2,
      height: options.text.offsetHeight + (LABEL_PADDING_Y + LABEL_BORDER) * 2,
      side: options.member.side(),
    })

  const resize = (options: {layer: Layer; text: HTMLElement}): void => {
    const trigger = options.layer.member.trigger()
    if (!trigger || state.layers.at(-1)?.id !== options.layer.id) return
    const next = measure({member: options.layer.member, trigger, text: options.text})
    if (next.width === state.geometry.width && next.height === state.geometry.height) return
    setState('geometry', next)
  }

  const lean: {position: number | undefined; spring: Spring} = {position: undefined, spring: {value: 0, velocity: 0}}

  const leanTick = (seconds: number): boolean => {
    const labelElement = label()
    const boxElement = box()
    if (!labelElement?.isConnected || !boxElement) return resetLean(boxElement)
    const side = state.geometry.side
    const [x = '0', y = '0'] = getComputedStyle(labelElement).translate.split(' ')
    const position = pixels(alongX(side) ? x : y)
    const gliding = labelElement.getAnimations().length > 0
    const speed = gliding && lean.position !== undefined ? (position - lean.position) / seconds : 0
    lean.spring = leanStep({spring: lean.spring, speed, seconds})
    lean.position = position
    if (!gliding && leanSettled(lean.spring)) return resetLean(boxElement)
    boxElement.style.rotate = leanRotation({spring: lean.spring, lean: config.lean, side})
    return true
  }

  const resetLean = (boxElement: HTMLElement | undefined): boolean => {
    lean.position = undefined
    lean.spring = {value: 0, velocity: 0}
    boxElement?.style.removeProperty('rotate')
    return false
  }

  const leanLoop = createFrameLoop(leanTick)

  const glide = (options: {
    layer: Layer
    element: HTMLElement
    labelElement: HTMLElement
    from: TooltipGeometry
    next: TooltipGeometry
  }): void => {
    const {layer, element, labelElement, from, next} = options
    const easing = springEasing({duration: config.travel, bounce: GLIDE_BOUNCE})
    labelElement.animate([geometryFrame(from), geometryFrame(next)], {duration: config.travel, easing})
    arrow()?.animate([arrowFrame(from), arrowFrame(next)], {duration: config.travel, easing})
    if (layer.direction !== 0) swapIn({element, direction: layer.direction, across: layer.across})
    if (config.lean > 0) leanLoop.start()
  }

  const glides = (options: {layer: Layer; from: TooltipGeometry; next: TooltipGeometry}): boolean =>
    options.layer.mode === 'move' &&
    !prefersReducedMotion() &&
    config.travel > 0 &&
    options.from.side === options.next.side

  const settle = (options: {layer: Layer; element: HTMLElement; text: HTMLElement}): void => {
    const {layer, element, text} = options
    setState('layers', (item) => item.id === layer.id, 'element', element)
    const trigger = layer.member.trigger()
    const labelElement = label()
    const boxElement = box()
    if (!trigger || !labelElement || !boxElement) return
    const next = measure({member: layer.member, trigger, text})
    const from = liveGeometry({label: labelElement, arrow: arrow(), settled: {...state.geometry}})
    cancelAnimations(labelElement)
    cancelAnimations(arrow())
    setState('geometry', next)
    if (layer.mode === 'cold') popIn({element: boxElement, side: next.side})
    if (glides({layer, from, next})) glide({layer, element, labelElement, from, next})
  }

  const close = (member: TooltipGroupMember): void => {
    if (state.active?.id !== member.id || state.phase !== 'open') return
    const element = box()
    if (state.instant || prefersReducedMotion() || !element) {
      finishClose()
      return
    }
    setState('phase', 'closing')
    popOut({element, side: state.geometry.side}).onfinish = () => {
      if (state.phase === 'closing') finishClose()
    }
  }

  const follow = (): void => {
    const trigger = state.active?.trigger()
    if (!trigger || !state.active) return
    setState(
      'geometry',
      labelGeometry({
        anchor: anchorPoint({
          rect: trigger.getBoundingClientRect(),
          side: state.geometry.side,
          gap: state.active.gap(),
        }),
        width: state.geometry.width,
        height: state.geometry.height,
        side: state.geometry.side,
      }),
    )
  }

  const group: TooltipGroupApi = {
    labelId,
    warm,
    openDelay: () => config.openDelay,
    open,
    close,
    arm: (arming) => {
      if (warm()) return
      setState('arming', arming)
    },
    disarm: (member) => {
      if (state.arming?.member.id === member.id) setState('arming', null)
    },
    forget: (member) => {
      if (state.arming?.member.id === member.id) setState('arming', null)
      if (state.active?.id === member.id) closeNow()
    },
  }

  function Label(): JSX.Element {
    makeEventListener(
      window,
      'keydown',
      (event) => {
        if (event.key === 'Escape') closeNow()
      },
      {capture: true},
    )
    makeEventListener(
      window,
      'focusout',
      (event) => {
        if (pathHas({event, element: state.active?.trigger()})) closeNow()
      },
      {capture: true},
    )
    makeEventListener(
      window,
      'pointerdown',
      (event) => {
        const member = state.active
        if (!member || pathHas({event, element: member.trigger()})) return
        member.close()
        close(member)
      },
      {capture: true},
    )
    makeEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      state.active?.close()
      closeNow()
    })
    makeEventListener(window, 'scroll', follow, {capture: true, passive: true})
    makeEventListener(window, 'resize', follow)
    return (
      <div
        ref={setLabel}
        id={labelId}
        role="tooltip"
        data-side={state.geometry.side}
        class={LABEL}
        style={{
          translate: `${state.geometry.x}px ${state.geometry.y}px`,
          width: `${state.geometry.width}px`,
          height: `${state.geometry.height}px`,
        }}
      >
        <div ref={setBox} class={BOX} style={{'transform-origin': TRANSFORM_ORIGIN[state.geometry.side]}}>
          <For each={state.layers}>{(layer) => <LayerView layer={layer} onReady={settle} onResize={resize} />}</For>
          <span
            ref={setArrow}
            aria-hidden="true"
            class={ARROW[state.geometry.side]}
            style={
              alongX(state.geometry.side) ? {left: `${state.geometry.arrow}px`} : {top: `${state.geometry.arrow}px`}
            }
          />
        </div>
      </div>
    )
  }

  return (
    <GroupContext.Provider value={group}>
      {props.children}
      <Show when={visible()}>
        <Label />
      </Show>
      <Show when={config.fuse && state.arming} keyed>
        {(arming) => <Fuse arming={arming} />}
      </Show>
      <Show when={cooling()}>
        <Timer
          delay={config.warmWindow}
          onDone={() => setState('phase', (phase) => (phase === 'open' ? phase : 'idle'))}
        />
      </Show>
    </GroupContext.Provider>
  )
}
