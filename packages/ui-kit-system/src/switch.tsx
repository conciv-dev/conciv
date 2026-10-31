import {createContext, createSignal, splitProps, useContext, type ComponentProps, type JSX} from 'solid-js'
import {Switch as Ark, useSwitchContext} from '@ark-ui/solid/switch'
import {makeEventListener} from '@solid-primitives/event-listener'
import {clamp, createFrameLoop, prefersReducedMotion, springSettled, springStep, type Spring} from './motion.js'

const ROOT =
  'inline-flex items-center gap-2 cursor-pointer select-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const CONTROL =
  'relative inline-flex items-center w-8 h-4.5 rounded-chat-pill bg-chat-fill-strong [border:1px_solid_var(--chat-line)] [transition:background-color_320ms_ease,border-color_320ms_ease] motion-reduce:[transition-duration:1ms] touch-pan-y data-[state=checked]:bg-chat-accent data-[state=checked]:[border-color:var(--chat-accent)] data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem]'
const THUMB =
  'size-3.5 rounded-chat-pill bg-chat-text translate-x-0.5 [transition:background-color_320ms_ease] motion-reduce:[transition-duration:1ms] data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-chat-on-accent'
const LABEL = 'text-[0.8125rem] font-chat text-chat-text-2'

const THUMB_INSET = 2
const POSITION_SPRING = {stiffness: 170, damping: 21.5, mass: 0.9}
const FLOW_SPRING = {stiffness: 320, damping: 40, mass: 0.6}
const SWELL_SPRING = {stiffness: 520, damping: 34, mass: 0.6}
const MAX_STRETCH = 0.4
const STRETCH_SPEED = 600
const STRETCH_GAIN = 0.36
const REFERENCE_TRAVEL = 42
const HOVER_SCALE = 1.035
const TAP_SLOP = {fine: 4, coarse: 8}

type ThumbMotion = {
  position: Spring
  flow: Spring
  swell: Spring
  swellTarget: number
  previous: number | undefined
  drag: number | undefined
}

type Grip = {
  pointerId: number | undefined
  startX: number
  grab: number | undefined
  moved: boolean
  checkedAtPress: boolean
  slop: number
  swallow: boolean
}

type SwitchMotion = {
  setControl: (element: HTMLElement) => void
  setThumb: (element: HTMLElement) => void
  control: () => HTMLElement | undefined
  bounds: () => {min: number; max: number}
  current: () => number
  kick: (from?: number) => void
  drag: (position: number | undefined) => void
  hover: (scale: number) => void
}

const SwitchMotionContext = createContext<SwitchMotion>()

const resting = (): Spring => ({value: 0, velocity: 0})

function createSwitchMotion(): SwitchMotion {
  const [control, setControl] = createSignal<HTMLElement>()
  const [thumb, setThumb] = createSignal<HTMLElement>()
  const motion: ThumbMotion = {
    position: resting(),
    flow: resting(),
    swell: {value: 1, velocity: 0},
    swellTarget: 1,
    previous: undefined,
    drag: undefined,
  }

  const bounds = () => {
    const width = control()?.clientWidth ?? 0
    const size = thumb()?.offsetWidth ?? 0
    return {min: THUMB_INSET, max: Math.max(THUMB_INSET, width - THUMB_INSET - size)}
  }
  const rest = (): number => (thumb()?.dataset.state === 'checked' ? bounds().max : bounds().min)

  const paint = (options: {element: HTMLElement; offset: number; stretch: number; swell: number}): void => {
    const {element, offset, stretch, swell} = options
    element.style.transform = `translateX(${offset}px) scale(${stretch * swell}, ${swell / stretch})`
  }

  const settle = (element: HTMLElement): boolean => {
    motion.previous = undefined
    motion.position = {value: rest(), velocity: 0}
    motion.flow = resting()
    motion.swell = {value: motion.swellTarget, velocity: 0}
    if (motion.swellTarget === 1) element.style.removeProperty('transform')
    if (motion.swellTarget !== 1) paint({element, offset: 0, stretch: 1, swell: motion.swellTarget})
    return false
  }

  const still = (target: number): boolean =>
    motion.drag === undefined &&
    springSettled({spring: motion.position, target, precision: 0.01}) &&
    springSettled({spring: motion.flow, target: 0, precision: 1}) &&
    springSettled({spring: motion.swell, target: motion.swellTarget})

  const advance = (options: {target: number; seconds: number}): void => {
    const {target, seconds} = options
    motion.position =
      motion.drag === undefined
        ? springStep({spring: motion.position, target, config: POSITION_SPRING, seconds})
        : {value: motion.drag, velocity: 0}
    const speed = motion.previous === undefined ? 0 : (motion.position.value - motion.previous) / seconds
    motion.previous = motion.position.value
    motion.flow = springStep({spring: motion.flow, target: speed, config: FLOW_SPRING, seconds})
    motion.swell = springStep({spring: motion.swell, target: motion.swellTarget, config: SWELL_SPRING, seconds})
  }

  const tick = (seconds: number): boolean => {
    const element = thumb()
    if (!element?.isConnected) return false
    const target = motion.drag ?? rest()
    advance({target, seconds})
    if (still(target)) return settle(element)
    const {min, max} = bounds()
    const threshold = STRETCH_SPEED * (Math.max(1, max - min) / REFERENCE_TRAVEL)
    const stretch = 1 + Math.min(MAX_STRETCH, Math.abs(motion.flow.value) / threshold) * STRETCH_GAIN
    paint({element, offset: motion.position.value - rest(), stretch, swell: motion.swell.value})
    return true
  }

  const loop = createFrameLoop(tick)

  const kick = (from?: number): void => {
    if (prefersReducedMotion()) return
    if (!loop.running()) motion.position = {value: from ?? rest(), velocity: 0}
    loop.start()
  }

  const drag = (position: number | undefined): void => {
    motion.drag = position
    const element = thumb()
    if (!prefersReducedMotion() || !element) {
      kick()
      return
    }
    if (position === undefined) element.style.removeProperty('transform')
    if (position !== undefined) element.style.transform = `translateX(${position - rest()}px)`
  }

  return {
    setControl,
    setThumb,
    control,
    bounds,
    current: () => (loop.running() ? motion.position.value : rest()),
    kick,
    drag,
    hover: (scale) => {
      motion.swellTarget = scale
      kick()
    },
  }
}

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class', 'onCheckedChange'])
  const motion = createSwitchMotion()
  const onCheckedChange: ComponentProps<typeof Ark.Root>['onCheckedChange'] = (details) => {
    const {min, max} = motion.bounds()
    motion.kick(details.checked ? min : max)
    local.onCheckedChange?.(details)
  }
  return (
    <SwitchMotionContext.Provider value={motion}>
      <Ark.Root {...rest} onCheckedChange={onCheckedChange} class={`${ROOT}  ${local.class ?? ''}`} />
    </SwitchMotionContext.Provider>
  )
}

function emptyGrip(): Grip {
  return {
    pointerId: undefined,
    startX: 0,
    grab: undefined,
    moved: false,
    checkedAtPress: false,
    slop: 0,
    swallow: false,
  }
}

type ControlEvent<E extends Event> = E & {currentTarget: HTMLSpanElement; target: Element}

function callHandler<E extends Event>(options: {
  handler: JSX.EventHandlerUnion<HTMLSpanElement, E> | undefined
  event: ControlEvent<E>
}): void {
  const {handler, event} = options
  if (typeof handler === 'function') {
    handler(event)
    return
  }
  if (handler) handler[0](handler[1], event)
}

function Control(props: ComponentProps<typeof Ark.Control>) {
  const [local, handlers, rest] = splitProps(
    props,
    ['class', 'ref'],
    ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onPointerEnter', 'onPointerLeave', 'onClick'],
  )
  const api = useSwitchContext()
  const motion = useContext(SwitchMotionContext)
  const grip: Grip = emptyGrip()

  const localX = (options: {element: HTMLElement; clientX: number}): number =>
    options.clientX - options.element.getBoundingClientRect().left - options.element.clientLeft

  const end = (options: {element: HTMLElement; pointerId: number}): void => {
    if (options.element.hasPointerCapture(options.pointerId)) options.element.releasePointerCapture(options.pointerId)
    Object.assign(grip, {...emptyGrip(), swallow: grip.moved})
    motion?.drag(undefined)
  }

  const cancel = (element: HTMLElement): void => {
    const pointerId = grip.pointerId
    if (pointerId === undefined) return
    api().setChecked(grip.checkedAtPress)
    end({element, pointerId})
    grip.swallow = true
  }

  const press = (event: PointerEvent & {currentTarget: HTMLElement}): void => {
    if (api().disabled || event.button !== 0 || grip.pointerId !== undefined) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = localX({element: event.currentTarget, clientX: event.clientX})
    Object.assign(grip, {
      ...emptyGrip(),
      pointerId: event.pointerId,
      startX: event.clientX,
      grab: motion === undefined ? undefined : pointer - motion.current(),
      checkedAtPress: api().checked,
      slop: event.pointerType === 'touch' ? TAP_SLOP.coarse : TAP_SLOP.fine,
    })
  }

  const move = (event: PointerEvent & {currentTarget: HTMLElement}): void => {
    if (!motion || grip.pointerId !== event.pointerId || grip.grab === undefined) return
    const pointer = localX({element: event.currentTarget, clientX: event.clientX})
    if (!grip.moved && Math.abs(event.clientX - grip.startX) > grip.slop) grip.moved = true
    if (!grip.moved) return
    const {min, max} = motion.bounds()
    const position = clamp({value: pointer - grip.grab, min, max})
    motion.drag(position)
    const next = position > (min + max) / 2
    if (next !== api().checked) api().setChecked(next)
  }

  const release = (event: PointerEvent & {currentTarget: HTMLElement}): void => {
    if (grip.pointerId !== event.pointerId) return
    end({element: event.currentTarget, pointerId: event.pointerId})
  }

  const swallow = (event: MouseEvent): void => {
    if (!grip.swallow) return
    grip.swallow = false
    event.preventDefault()
  }

  makeEventListener(window, 'keydown', (event) => {
    const element = motion?.control()
    if (event.key === 'Escape' && element) cancel(element)
  })

  return (
    <Ark.Control
      {...rest}
      ref={(element: HTMLElement) => {
        motion?.setControl(element)
        if (typeof local.ref === 'function') local.ref(element)
      }}
      class={`${CONTROL}  ${local.class ?? ''}`}
      onPointerDown={(event) => {
        const prevented = event.defaultPrevented
        callHandler({handler: handlers.onPointerDown, event})
        if (prevented || !event.defaultPrevented) press(event)
      }}
      onPointerMove={(event) => {
        callHandler({handler: handlers.onPointerMove, event})
        move(event)
      }}
      onPointerUp={(event) => {
        callHandler({handler: handlers.onPointerUp, event})
        release(event)
      }}
      onPointerCancel={(event) => {
        callHandler({handler: handlers.onPointerCancel, event})
        cancel(event.currentTarget)
      }}
      onPointerEnter={(event) => {
        callHandler({handler: handlers.onPointerEnter, event})
        if (event.pointerType === 'mouse' && !api().disabled) motion?.hover(HOVER_SCALE)
      }}
      onPointerLeave={(event) => {
        callHandler({handler: handlers.onPointerLeave, event})
        motion?.hover(1)
      }}
      onClick={(event) => {
        callHandler({handler: handlers.onClick, event})
        swallow(event)
      }}
    />
  )
}

function Thumb(props: ComponentProps<typeof Ark.Thumb>) {
  const [local, rest] = splitProps(props, ['class', 'ref'])
  const motion = useContext(SwitchMotionContext)
  return (
    <Ark.Thumb
      {...rest}
      ref={(element: HTMLElement) => {
        motion?.setThumb(element)
        if (typeof local.ref === 'function') local.ref(element)
      }}
      class={`${THUMB}  ${local.class ?? ''}`}
    />
  )
}

function Label(props: ComponentProps<typeof Ark.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

function HiddenInput(props: ComponentProps<typeof Ark.HiddenInput>) {
  return <Ark.HiddenInput role="switch" {...props} />
}

export const Switch = Object.assign({}, Ark, {Root, Control, Thumb, Label, HiddenInput})
