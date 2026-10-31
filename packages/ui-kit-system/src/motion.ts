import {onCleanup} from 'solid-js'

export type Spring = {value: number; velocity: number}

export type SpringConfig = {stiffness: number; damping: number; mass: number}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const MAX_FRAME_SECONDS = 1 / 20
const MIN_FRAME_SECONDS = 1 / 240
const SUBSTEP_SECONDS = 1 / 240

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches
}

export function clamp(options: {value: number; min: number; max: number}): number {
  return Math.min(options.max, Math.max(options.min, options.value))
}

function springSubstep(options: {spring: Spring; target: number; config: SpringConfig; seconds: number}): Spring {
  const {spring, target, config, seconds} = options
  const force = config.stiffness * (target - spring.value) - config.damping * spring.velocity
  const velocity = spring.velocity + (force / config.mass) * seconds
  return {value: spring.value + velocity * seconds, velocity}
}

export function springStep(options: {spring: Spring; target: number; config: SpringConfig; seconds: number}): Spring {
  const steps = Math.max(1, Math.ceil(options.seconds / SUBSTEP_SECONDS))
  const seconds = options.seconds / steps
  return Array.from({length: steps}).reduce<Spring>(
    (spring) => springSubstep({spring, target: options.target, config: options.config, seconds}),
    options.spring,
  )
}

export function springSettled(options: {spring: Spring; target: number; precision?: number}): boolean {
  const precision = options.precision ?? 0.001
  return (
    Math.abs(options.spring.value - options.target) < precision && Math.abs(options.spring.velocity) < precision * 10
  )
}

export type FrameLoop = {start: () => void; stop: () => void; running: () => boolean}

export function createFrameLoop(tick: (seconds: number) => boolean): FrameLoop {
  const frame = {id: 0, time: 0}
  const stop = (): void => {
    cancelAnimationFrame(frame.id)
    frame.id = 0
  }
  const step = (time: number): void => {
    const seconds = clamp({value: (time - frame.time) / 1000, min: MIN_FRAME_SECONDS, max: MAX_FRAME_SECONDS})
    frame.time = time
    if (!tick(seconds)) {
      frame.id = 0
      return
    }
    frame.id = requestAnimationFrame(step)
  }
  const start = (): void => {
    if (frame.id !== 0) return
    frame.time = performance.now()
    frame.id = requestAnimationFrame(step)
  }
  onCleanup(stop)
  return {start, stop, running: () => frame.id !== 0}
}
