import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const HEART_CELLS: [number, number][] = [
  [1, 0],
  [2, 0],
  [4, 0],
  [5, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [5, 3],
  [2, 4],
  [3, 4],
  [4, 4],
  [3, 5],
]

const HEART_PIXEL_PX = 3
const HEART_LEFT_PX = -11
const HEART_TOP_PX = -32
const HEART_COLOR = 'var(--pw-accent, #e0218a)'
const HEART_PULSE_SCALE = 1.22
const HEART_PULSE_DURATION_S = 0.42
const HEART_PULSE_EASE = 'sine.inOut'

function createPixel(factor: number, cell: [number, number]): HTMLElement {
  const pixel = document.createElement('span')
  const size = HEART_PIXEL_PX * factor
  const left = cell[0] * HEART_PIXEL_PX * factor
  const top = cell[1] * HEART_PIXEL_PX * factor
  pixel.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${size}px;height:${size}px;background:${HEART_COLOR}`
  return pixel
}

function createHeart(factor: number): HTMLElement {
  const heart = document.createElement('span')
  const left = HEART_LEFT_PX * factor
  const top = HEART_TOP_PX * factor
  heart.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:0;height:0`
  heart.append(...HEART_CELLS.map((cell) => createPixel(factor, cell)))
  return heart
}

function createPulseTimeline(heart: HTMLElement): gsap.core.Timeline {
  return gsap
    .timeline()
    .to(
      heart,
      {scale: HEART_PULSE_SCALE, duration: HEART_PULSE_DURATION_S, ease: HEART_PULSE_EASE, yoyo: true, repeat: -1},
      0,
    )
}

function createHeartEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const heart = createHeart(factor)
  element.append(heart)
  host.append(element)
  const timeline = createPulseTimeline(heart)
  return createTimelineEmitter(element, timeline)
}

export const heartEffect: EffectMount = (context) => createHeartEmitter(context)
