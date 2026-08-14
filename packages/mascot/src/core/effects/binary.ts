import gsap from 'gsap'
import {
  BINARY_EMITTER_COLOR,
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_FONT_FAMILY,
  BINARY_EMITTER_FONT_SIZE_PX,
  BINARY_EMITTER_FONT_WEIGHT,
  BINARY_EMITTER_LANE_OFFSET_PX,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
  BINARY_EMITTER_STAGGER_S,
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

const FONT_STACK = `${BINARY_EMITTER_FONT_FAMILY},SFMono-Regular,monospace`
const DIGIT_CENTER_LEFT_PX = -4
const DIGIT_TOP_PX = -12
const DIGIT_INDEXES = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, index) => index)

const isLeadingLane = (index: number): boolean => index % 2 === 0

function createDigit(index: number): HTMLElement {
  const digit = document.createElement('span')
  const lane = isLeadingLane(index) ? BINARY_EMITTER_LANE_OFFSET_PX : -BINARY_EMITTER_LANE_OFFSET_PX
  digit.textContent = isLeadingLane(index) ? '1' : '0'
  digit.style.cssText = `position:absolute;left:${DIGIT_CENTER_LEFT_PX + lane}px;top:${DIGIT_TOP_PX}px`
  return digit
}

function createShell(tip: EmitterAnchor): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText =
    `position:absolute;left:${tip.x}px;top:${tip.y}px;width:0;height:0;pointer-events:none;` +
    `color:${BINARY_EMITTER_COLOR};font-family:${FONT_STACK};font-size:${BINARY_EMITTER_FONT_SIZE_PX}px;` +
    `font-weight:${BINARY_EMITTER_FONT_WEIGHT};line-height:1;will-change:transform,opacity`
  return element
}

function createRiseTimeline(digits: HTMLElement[]): gsap.core.Timeline {
  gsap.set(digits, {opacity: 0})
  return gsap.timeline().fromTo(
    digits,
    {y: 0, opacity: 0},
    {
      y: BINARY_EMITTER_RISE_PX,
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
  const element = createShell(tip)
  const digits = DIGIT_INDEXES.map(createDigit)
  element.append(...digits)
  stage.append(element)
  const timeline = createRiseTimeline(digits)
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
