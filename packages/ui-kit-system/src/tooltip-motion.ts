export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

export type TooltipPoint = {x: number; y: number}

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const POP_DURATION = 160
export const SWAP_DURATION = 140

const POP_SCALE = 0.94
const POP_BLUR = 4
const RISE = 4
const SWAP_SHIFT = 10
const SWAP_BLUR = 3
const EDGE_MARGIN = 8
const ARROW_INSET = 10
const FULL_LEAN_SPEED = 1200
const LEAN_STIFFNESS = 260
const LEAN_DAMPING = 22
const LEAN_MASS = 0.4
const FRAME_SECONDS = 1 / 60
const LEAN_SETTLE_SECONDS = 0.45
const SPRING_SAMPLES = 40
const SPRING_SETTLE = 6.2
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export const TRANSFORM_ORIGIN: Record<TooltipSide, string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center',
}

const TOWARD_TRIGGER: Record<TooltipSide, TooltipPoint> = {
  top: {x: 0, y: 1},
  bottom: {x: 0, y: -1},
  left: {x: 1, y: 0},
  right: {x: -1, y: 0},
}

const LEAN_SIGN: Record<TooltipSide, number> = {top: 1, bottom: -1, left: -1, right: 1}

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches
}

export function sideFromPlacement(placement: string | undefined): TooltipSide {
  const [side] = (placement ?? 'top').split('-')
  if (side === 'bottom' || side === 'left' || side === 'right') return side
  return 'top'
}

export function alongX(side: TooltipSide): boolean {
  return side === 'top' || side === 'bottom'
}

function clamp(options: {value: number; min: number; max: number}): number {
  return Math.min(options.max, Math.max(options.min, options.value))
}

function hiddenPop(side: TooltipSide): Keyframe {
  const toward = TOWARD_TRIGGER[side]
  return {
    opacity: 0,
    scale: `${POP_SCALE}`,
    translate: `${toward.x * RISE}px ${toward.y * RISE}px`,
    filter: `blur(${POP_BLUR}px)`,
  }
}

const SHOWN_POP: Keyframe = {opacity: 1, scale: '1', translate: '0px 0px', filter: 'blur(0px)'}

export function popIn(options: {element: HTMLElement; side: TooltipSide}): void {
  if (prefersReducedMotion()) return
  options.element.animate([hiddenPop(options.side), SHOWN_POP], {duration: POP_DURATION, easing: EASE_OUT})
}

export function popOut(options: {element: HTMLElement; side: TooltipSide}): Animation {
  return options.element.animate([SHOWN_POP, hiddenPop(options.side)], {
    duration: Math.round(POP_DURATION * 0.8),
    easing: EASE_OUT,
  })
}

function swapShift(options: {direction: number; across: boolean}): string {
  const distance = SWAP_SHIFT * options.direction
  if (options.across) return `0px ${distance}px`
  return `${distance}px 0px`
}

const SHOWN_SWAP: Keyframe = {opacity: 1, translate: '0px 0px', filter: 'blur(0px)'}

export function swapIn(options: {element: HTMLElement; direction: number; across: boolean}): void {
  options.element.animate([{opacity: 0, translate: swapShift(options), filter: `blur(${SWAP_BLUR}px)`}, SHOWN_SWAP], {
    duration: SWAP_DURATION,
    easing: EASE_OUT,
  })
}

export function swapOut(options: {element: HTMLElement; direction: number; across: boolean}): Animation {
  return options.element.animate(
    [
      SHOWN_SWAP,
      {
        opacity: 0,
        translate: swapShift({direction: -options.direction, across: options.across}),
        filter: `blur(${SWAP_BLUR}px)`,
      },
    ],
    {duration: SWAP_DURATION, easing: EASE_OUT},
  )
}

export function anchorPoint(options: {rect: DOMRect; side: TooltipSide; gap: number}): TooltipPoint {
  const {rect, side, gap} = options
  if (side === 'top') return {x: rect.left + rect.width / 2, y: rect.top - gap}
  if (side === 'bottom') return {x: rect.left + rect.width / 2, y: rect.bottom + gap}
  if (side === 'left') return {x: rect.left - gap, y: rect.top + rect.height / 2}
  return {x: rect.right + gap, y: rect.top + rect.height / 2}
}

export type TooltipGeometry = {
  x: number
  y: number
  width: number
  height: number
  arrow: number
  side: TooltipSide
}

export function labelGeometry(options: {
  anchor: TooltipPoint
  width: number
  height: number
  side: TooltipSide
}): TooltipGeometry {
  const {anchor, width, height, side} = options
  if (alongX(side)) {
    const x = clamp({
      value: anchor.x - width / 2,
      min: EDGE_MARGIN,
      max: Math.max(EDGE_MARGIN, window.innerWidth - EDGE_MARGIN - width),
    })
    const arrow = clamp({value: anchor.x - x, min: ARROW_INSET, max: width - ARROW_INSET})
    return {x, y: side === 'top' ? anchor.y - height : anchor.y, width, height, arrow, side}
  }
  const y = clamp({
    value: anchor.y - height / 2,
    min: EDGE_MARGIN,
    max: Math.max(EDGE_MARGIN, window.innerHeight - EDGE_MARGIN - height),
  })
  const arrow = clamp({value: anchor.y - y, min: ARROW_INSET, max: height - ARROW_INSET})
  return {x: side === 'left' ? anchor.x - width : anchor.x, y, width, height, arrow, side}
}

function springAt(options: {seconds: number; duration: number; bounce: number}): number {
  const damping = 1 - options.bounce
  const natural = SPRING_SETTLE / (damping * options.duration)
  const damped = natural * Math.sqrt(1 - damping * damping)
  const envelope = Math.exp(-damping * natural * options.seconds)
  return (
    1 -
    envelope *
      (Math.cos(damped * options.seconds) + ((damping * natural) / damped) * Math.sin(damped * options.seconds))
  )
}

export function springEasing(options: {duration: number; bounce: number}): string {
  const seconds = options.duration / 1000
  const points = Array.from({length: SPRING_SAMPLES + 1}, (_, index) =>
    index === SPRING_SAMPLES
      ? 1
      : springAt({seconds: (index / SPRING_SAMPLES) * seconds, duration: seconds, bounce: options.bounce}),
  )
  return `linear(${points.map((point) => point.toFixed(4)).join(', ')})`
}

type LeanStep = {unit: number; velocity: number; turns: number[]}

export function leanFrames(options: {
  distance: number
  duration: number
  bounce: number
  lean: number
  side: TooltipSide
}): Keyframe[] {
  const seconds = options.duration / 1000
  const count = Math.ceil((seconds + LEAN_SETTLE_SECONDS) / FRAME_SECONDS)
  const speedAt = (time: number): number =>
    time >= seconds
      ? 0
      : (options.distance *
          (springAt({seconds: time + FRAME_SECONDS, duration: seconds, bounce: options.bounce}) -
            springAt({seconds: time, duration: seconds, bounce: options.bounce}))) /
        FRAME_SECONDS
  const folded = Array.from({length: count}, (_, index) => index * FRAME_SECONDS).reduce<LeanStep>(
    (step, time) => {
      const target = clamp({value: -speedAt(time) / FULL_LEAN_SPEED, min: -1, max: 1})
      const force = LEAN_STIFFNESS * (target - step.unit) - LEAN_DAMPING * step.velocity
      const velocity = step.velocity + (force / LEAN_MASS) * FRAME_SECONDS
      const unit = step.unit + velocity * FRAME_SECONDS
      return {unit, velocity, turns: [...step.turns, unit * options.lean * LEAN_SIGN[options.side]]}
    },
    {unit: 0, velocity: 0, turns: []},
  )
  return [0, ...folded.turns, 0].map((turn) => ({rotate: `${turn.toFixed(3)}deg`}))
}

export function leanDuration(frames: Keyframe[]): number {
  return Math.round(frames.length * FRAME_SECONDS * 1000)
}
