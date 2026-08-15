import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const STEAM_COLOR = 'rgba(148, 158, 178, 0.55)'

const PUFF_COUNT = 4

const PUFF_INDEXES = Array.from({length: PUFF_COUNT}, (_, index) => index)

const PUFF_LEFT_PX = -6

const PUFF_TOP_PX = -10

const PUFF_SIZE_PX = 13

const PUFF_BLUR_PX = 2

const PUFF_INITIAL_OPACITY_BASE = 0.55

const PUFF_INITIAL_OPACITY_STEP = 0.12

const PUFF_RISE_Y_PX = -52

const PUFF_LEAD_LANE_X_PX = 10

const PUFF_TRAIL_LANE_X_PX = -8

const PUFF_START_SCALE = 0.45

const PUFF_END_SCALE = 1.7

const PUFF_RISE_DURATION_S = 2.4

const PUFF_RISE_EASE = 'sine.out'

const PUFF_RISE_STAGGER_S = 0.6

const PUFF_OPACITY_KEYFRAMES = [0, 0.7, 0.5, 0]

const isLeadPuff = (index: number): boolean => index % 2 === 0

function createPuff(factor: number, index: number): HTMLElement {
  const puff = document.createElement('span')
  puff.style.cssText =
    `position:absolute;left:${PUFF_LEFT_PX * factor}px;top:${PUFF_TOP_PX * factor}px;` +
    `width:${PUFF_SIZE_PX * factor}px;height:${PUFF_SIZE_PX * factor}px;border-radius:50%;` +
    `background:${STEAM_COLOR};filter:blur(${PUFF_BLUR_PX * factor}px);` +
    `opacity:${PUFF_INITIAL_OPACITY_BASE - index * PUFF_INITIAL_OPACITY_STEP}`
  return puff
}

function createPuffTimeline(puffs: HTMLElement[], factor: number): gsap.core.Timeline {
  return gsap.timeline().fromTo(
    puffs,
    {y: 0, x: 0, scale: PUFF_START_SCALE, opacity: 0},
    {
      y: PUFF_RISE_Y_PX * factor,
      x: (index: number) => (isLeadPuff(index) ? PUFF_LEAD_LANE_X_PX : PUFF_TRAIL_LANE_X_PX) * factor,
      scale: PUFF_END_SCALE,
      opacity: 0,
      duration: PUFF_RISE_DURATION_S,
      ease: PUFF_RISE_EASE,
      stagger: {each: PUFF_RISE_STAGGER_S, repeat: -1},
      keyframes: {opacity: PUFF_OPACITY_KEYFRAMES, easeEach: 'none'},
    },
    0,
  )
}

function createSteamEffect(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const puffs = PUFF_INDEXES.map((index) => createPuff(factor, index))
  element.append(...puffs)
  host.append(element)
  const timeline = createPuffTimeline(puffs, factor)
  return createTimelineEmitter(element, timeline)
}

export const steamEffect: EffectMount = (context) => createSteamEffect(context)
