import gsap from 'gsap'
import {
  BINARY_EMITTER_COLOR,
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_DIGIT_LEFT_PX,
  BINARY_EMITTER_DIGIT_TOP_PX,
  BINARY_EMITTER_FONT_FAMILY,
  BINARY_EMITTER_FONT_SIZE_PX,
  BINARY_EMITTER_FONT_WEIGHT,
  BINARY_EMITTER_LANE_OFFSET_PX,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
  BINARY_EMITTER_STAGGER_S,
  EMITTER_REFERENCE_STAGE_PX,
  ENTER_DURATION_S,
  ENTER_EASE,
} from '../config.js'
import type {EmitterAnchor} from '../path.js'
import {enterFromTip, exitIntoTip} from '../tip-transition.js'

export type BinaryEmitter = {
  element: HTMLElement
  start: () => void
  stop: (onRemoved: () => void) => void
  remove: () => void
}

const DIGIT_INDEXES = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, index) => index)

const isLeadingLane = (index: number): boolean => index % 2 === 0

function stageScaleFactor(stage: HTMLElement): number {
  const size = Math.min(stage.offsetWidth, stage.offsetHeight)
  if (size <= 0) return 1
  return size / EMITTER_REFERENCE_STAGE_PX
}

function createDigit(factor: number, index: number): HTMLElement {
  const digit = document.createElement('span')
  const lane = isLeadingLane(index) ? BINARY_EMITTER_LANE_OFFSET_PX : -BINARY_EMITTER_LANE_OFFSET_PX
  const left = (BINARY_EMITTER_DIGIT_LEFT_PX + lane) * factor
  const top = BINARY_EMITTER_DIGIT_TOP_PX * factor
  digit.textContent = isLeadingLane(index) ? '1' : '0'
  digit.style.cssText = `position:absolute;left:${left}px;top:${top}px`
  return digit
}

function createShell(tip: EmitterAnchor, factor: number): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText =
    `position:absolute;left:${tip.x}px;top:${tip.y}px;width:0;height:0;pointer-events:none;` +
    `color:${BINARY_EMITTER_COLOR};font-family:${BINARY_EMITTER_FONT_FAMILY};` +
    `font-size:${BINARY_EMITTER_FONT_SIZE_PX * factor}px;` +
    `font-weight:${BINARY_EMITTER_FONT_WEIGHT};line-height:1;will-change:transform,opacity`
  return element
}

function createRiseTimeline(digits: HTMLElement[], factor: number): gsap.core.Timeline {
  gsap.set(digits, {opacity: 0})
  return gsap.timeline().fromTo(
    digits,
    {y: 0, opacity: 0},
    {
      y: BINARY_EMITTER_RISE_PX * factor,
      duration: BINARY_EMITTER_RISE_DURATION_S,
      ease: 'none',
      stagger: {each: BINARY_EMITTER_STAGGER_S, repeat: -1},
      keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
    },
    0,
  )
}

const returnToFull = (element: HTMLElement): gsap.core.Tween =>
  gsap.to(element, {scale: 1, opacity: 1, duration: ENTER_DURATION_S, ease: ENTER_EASE})

export function createBinaryEmitter(stage: HTMLElement, tip: EmitterAnchor): BinaryEmitter {
  const factor = stageScaleFactor(stage)
  const element = createShell(tip, factor)
  const digits = DIGIT_INDEXES.map((index) => createDigit(factor, index))
  element.append(...digits)
  stage.append(element)
  const timeline = createRiseTimeline(digits, factor)
  let enter: gsap.core.Tween | undefined
  let exit: gsap.core.Tween | undefined

  const remove = () => {
    exit?.kill()
    exit = undefined
    enter?.kill()
    enter = undefined
    timeline.kill()
    element.remove()
  }

  const start = () => {
    exit?.kill()
    exit = undefined
    enter = enter === undefined ? enterFromTip(element) : returnToFull(element)
  }

  const stop = (onRemoved: () => void) => {
    if (exit !== undefined) return
    enter?.kill()
    exit = exitIntoTip(element, () => {
      exit = undefined
      remove()
      onRemoved()
    })
  }

  return {element, start, stop, remove}
}
