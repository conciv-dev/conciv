import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const BUBBLE_INK_COLOR = '#2f3142'

const PAPER_COLOR = '#f7f4ef'

const DOT_COUNT = 3

const DOT_INDEXES = Array.from({length: DOT_COUNT}, (_, index) => index)

const BUBBLE_LEFT_PX = 2

const BUBBLE_TOP_PX = -40

const BUBBLE_WIDTH_PX = 40

const BUBBLE_HEIGHT_PX = 22

const BUBBLE_BORDER_WIDTH_PX = 2

const BUBBLE_BORDER_RADIUS_PX = 2

const BUBBLE_GAP_PX = 4

const DOT_SIZE_PX = 4

const TAIL_LEFT_PX = 5

const TAIL_TOP_PX = -22

const TAIL_SIZE_PX = 6

const TAIL_BORDER_WIDTH_PX = 2

const DOT_PULSE_START_OPACITY = 0.18

const DOT_PULSE_END_OPACITY = 1

const DOT_PULSE_DURATION_S = 0.26

const DOT_PULSE_STAGGER_S = 0.16

const DOT_PULSE_EASE = 'steps(1)'

function createBubbleBox(factor: number): HTMLElement {
  const box = document.createElement('span')
  box.style.cssText =
    `position:absolute;left:${BUBBLE_LEFT_PX * factor}px;top:${BUBBLE_TOP_PX * factor}px;` +
    `display:flex;align-items:center;justify-content:center;gap:${BUBBLE_GAP_PX * factor}px;` +
    `width:${BUBBLE_WIDTH_PX * factor}px;height:${BUBBLE_HEIGHT_PX * factor}px;` +
    `background:${PAPER_COLOR};border:${BUBBLE_BORDER_WIDTH_PX * factor}px solid ${BUBBLE_INK_COLOR};` +
    `border-radius:${BUBBLE_BORDER_RADIUS_PX * factor}px`
  return box
}

function createDot(factor: number): HTMLElement {
  const dot = document.createElement('span')
  dot.style.cssText = `width:${DOT_SIZE_PX * factor}px;height:${DOT_SIZE_PX * factor}px;background:${BUBBLE_INK_COLOR}`
  return dot
}

function createTail(factor: number): HTMLElement {
  const tail = document.createElement('span')
  tail.style.cssText =
    `position:absolute;left:${TAIL_LEFT_PX * factor}px;top:${TAIL_TOP_PX * factor}px;` +
    `width:${TAIL_SIZE_PX * factor}px;height:${TAIL_SIZE_PX * factor}px;background:${PAPER_COLOR};` +
    `border-right:${TAIL_BORDER_WIDTH_PX * factor}px solid ${BUBBLE_INK_COLOR};` +
    `border-bottom:${TAIL_BORDER_WIDTH_PX * factor}px solid ${BUBBLE_INK_COLOR};transform:rotate(45deg)`
  return tail
}

function createDotTimeline(dots: HTMLElement[]): gsap.core.Timeline {
  gsap.set(dots, {opacity: DOT_PULSE_START_OPACITY})
  return gsap.timeline().fromTo(
    dots,
    {opacity: DOT_PULSE_START_OPACITY},
    {
      opacity: DOT_PULSE_END_OPACITY,
      duration: DOT_PULSE_DURATION_S,
      stagger: DOT_PULSE_STAGGER_S,
      ease: DOT_PULSE_EASE,
      yoyo: true,
      repeat: -1,
    },
    0,
  )
}

function createSpeechBubbleEffect(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const box = createBubbleBox(factor)
  const dots = DOT_INDEXES.map(() => createDot(factor))
  box.append(...dots)
  const tail = createTail(factor)
  element.append(box, tail)
  host.append(element)
  return createTimelineEmitter(host, element, () => createDotTimeline(dots))
}

export const speechBubbleEffect: EffectMount = (context) => createSpeechBubbleEffect(context)
