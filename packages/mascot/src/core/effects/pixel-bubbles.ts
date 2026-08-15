import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const PIXEL_BUBBLES_ACCENT_COLOR = '#e0218a'

const PIXEL_BUBBLES_INK_COLOR = '#2f3142'

const PIXEL_BUBBLES_COUNT = 6

const PIXEL_BUBBLES_TOP_PX = -8

const PIXEL_BUBBLES_LEFT_EVEN_PX = 0

const PIXEL_BUBBLES_LEFT_ODD_PX = -4

const PIXEL_BUBBLES_SMALL_SIZE_PX = 3

const PIXEL_BUBBLES_LARGE_SIZE_PX = 5

const PIXEL_BUBBLES_RISE_PX = -56

const PIXEL_BUBBLES_DRIFT_PX = 7

const PIXEL_BUBBLES_RISE_DURATION_S = 2.1

const PIXEL_BUBBLES_STAGGER_S = 0.35

const SQUARE_INDEXES = Array.from({length: PIXEL_BUBBLES_COUNT}, (_, index) => index)

const isEvenLane = (index: number): boolean => index % 2 === 0

function createSquare(factor: number, index: number): HTMLElement {
  const square = document.createElement('span')
  const even = isEvenLane(index)
  const size = (index % 3 === 0 ? PIXEL_BUBBLES_LARGE_SIZE_PX : PIXEL_BUBBLES_SMALL_SIZE_PX) * factor
  const left = (even ? PIXEL_BUBBLES_LEFT_EVEN_PX : PIXEL_BUBBLES_LEFT_ODD_PX) * factor
  const color = even ? PIXEL_BUBBLES_ACCENT_COLOR : PIXEL_BUBBLES_INK_COLOR
  square.style.cssText =
    `position:absolute;left:${left}px;top:${PIXEL_BUBBLES_TOP_PX * factor}px;` +
    `width:${size}px;height:${size}px;background:${color}`
  return square
}

function createDriftTimeline(squares: HTMLElement[], factor: number): gsap.core.Timeline {
  gsap.set(squares, {x: 0, y: 0, opacity: 0})
  return gsap.timeline().fromTo(
    squares,
    {y: 0, x: 0, opacity: 0},
    {
      y: PIXEL_BUBBLES_RISE_PX * factor,
      x: (index: number) => (isEvenLane(index) ? PIXEL_BUBBLES_DRIFT_PX : -PIXEL_BUBBLES_DRIFT_PX) * factor,
      opacity: 0,
      duration: PIXEL_BUBBLES_RISE_DURATION_S,
      ease: 'none',
      stagger: {each: PIXEL_BUBBLES_STAGGER_S, repeat: -1},
      keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
    },
    0,
  )
}

function createPixelBubblesEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const squares = SQUARE_INDEXES.map((index) => createSquare(factor, index))
  element.append(...squares)
  host.append(element)
  return createTimelineEmitter(host, element, () => createDriftTimeline(squares, factor))
}

export const pixelBubblesEffect: EffectMount = (context) => createPixelBubblesEmitter(context)
