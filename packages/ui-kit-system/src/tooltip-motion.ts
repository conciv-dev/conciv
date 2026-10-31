import {clamp, prefersReducedMotion, springStep, springSettled, type Spring} from './motion.js'

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
const LEAN_SPRING = {stiffness: 260, damping: 22, mass: 0.4}
const SPRING_SAMPLES = 40
const SPRING_SETTLE = 6.2

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

export function sideFromPlacement(placement: string | undefined): TooltipSide {
  const [side] = (placement ?? 'top').split('-')
  if (side === 'bottom' || side === 'left' || side === 'right') return side
  return 'top'
}

export function alongX(side: TooltipSide): boolean {
  return side === 'top' || side === 'bottom'
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

export type TooltipViewport = {width: number; height: number}

const OPPOSITE: Record<TooltipSide, TooltipSide> = {top: 'bottom', bottom: 'top', left: 'right', right: 'left'}

function sideFits(options: {
  rect: DOMRect
  side: TooltipSide
  gap: number
  width: number
  height: number
  viewport: TooltipViewport
}): boolean {
  const {rect, side, gap, width, height, viewport} = options
  if (side === 'top') return rect.top - gap - height >= EDGE_MARGIN
  if (side === 'bottom') return rect.bottom + gap + height <= viewport.height - EDGE_MARGIN
  if (side === 'left') return rect.left - gap - width >= EDGE_MARGIN
  return rect.right + gap + width <= viewport.width - EDGE_MARGIN
}

function fittingSide(options: {
  rect: DOMRect
  side: TooltipSide
  gap: number
  width: number
  height: number
  viewport: TooltipViewport
}): TooltipSide {
  if (sideFits(options)) return options.side
  const opposite = OPPOSITE[options.side]
  if (sideFits({...options, side: opposite})) return opposite
  return options.side
}

function within(options: {value: number; size: number; extent: number}): number {
  return clamp({
    value: options.value,
    min: EDGE_MARGIN,
    max: Math.max(EDGE_MARGIN, options.extent - EDGE_MARGIN - options.size),
  })
}

export function labelGeometry(options: {
  rect: DOMRect
  side: TooltipSide
  gap: number
  width: number
  height: number
  viewport: TooltipViewport
}): TooltipGeometry {
  const {rect, gap, width, height, viewport} = options
  const side = fittingSide(options)
  const anchor = anchorPoint({rect, side, gap})
  if (alongX(side)) {
    const x = within({value: anchor.x - width / 2, size: width, extent: viewport.width})
    const y = within({value: side === 'top' ? anchor.y - height : anchor.y, size: height, extent: viewport.height})
    const arrow = clamp({value: anchor.x - x, min: ARROW_INSET, max: width - ARROW_INSET})
    return {x, y, width, height, arrow, side}
  }
  const x = within({value: side === 'left' ? anchor.x - width : anchor.x, size: width, extent: viewport.width})
  const y = within({value: anchor.y - height / 2, size: height, extent: viewport.height})
  const arrow = clamp({value: anchor.y - y, min: ARROW_INSET, max: height - ARROW_INSET})
  return {x, y, width, height, arrow, side}
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

export function leanStep(options: {spring: Spring; speed: number; seconds: number}): Spring {
  const target = clamp({value: -options.speed / FULL_LEAN_SPEED, min: -1, max: 1})
  return springStep({spring: options.spring, target, config: LEAN_SPRING, seconds: options.seconds})
}

export function leanSettled(spring: Spring): boolean {
  return springSettled({spring, target: 0})
}

export function leanRotation(options: {spring: Spring; lean: number; side: TooltipSide}): string {
  return `${(options.spring.value * options.lean * LEAN_SIGN[options.side]).toFixed(3)}deg`
}
