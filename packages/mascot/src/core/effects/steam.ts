import gsap from 'gsap'
import type {EmitterPoint} from '../path.js'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createNozzleEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const STEAM_CORE_COLOR = 'rgba(148, 158, 178, 0.55)'

const STEAM_EDGE_COLOR = 'rgba(148, 158, 178, 0)'

const STEAM_CORE_STOP = '46%'

const STEAM_EDGE_STOP = '100%'

export const PUFF_COUNT = 4

const PUFF_INDEXES = Array.from({length: PUFF_COUNT}, (_, index) => index)

const PUFF_LEFT_PX = -9

const PUFF_TOP_PX = -13

const PUFF_SIZE_PX = 19

const PUFF_INITIAL_OPACITY_BASE = 0.55

const PUFF_INITIAL_OPACITY_STEP = 0.12

export const PUFF_RISE_Y_PX = -52

const PUFF_LEAD_LANE_X_PX = 10

const PUFF_TRAIL_LANE_X_PX = -8

const PUFF_START_SCALE = 0.45

const PUFF_END_SCALE = 1.7

export const PUFF_RISE_DURATION_S = 2.4

const PUFF_RISE_EASE = 'sine.out'

const PUFF_RISE_STAGGER_S = 0.6

const PUFF_OPACITY_KEYFRAMES = [0, 0.7, 0.5, 0]

const isLeadPuff = (index: number): boolean => index % 2 === 0

function createPuff(factor: number, index: number): HTMLElement {
  const puff = document.createElement('span')
  puff.style.cssText =
    `position:absolute;left:${PUFF_LEFT_PX * factor}px;top:${PUFF_TOP_PX * factor}px;` +
    `width:${PUFF_SIZE_PX * factor}px;height:${PUFF_SIZE_PX * factor}px;` +
    `background:radial-gradient(circle closest-side,${STEAM_CORE_COLOR} ${STEAM_CORE_STOP},` +
    `${STEAM_EDGE_COLOR} ${STEAM_EDGE_STOP});` +
    `opacity:${PUFF_INITIAL_OPACITY_BASE - index * PUFF_INITIAL_OPACITY_STEP}`
  return puff
}

const puffLaunch = (nozzle: EmitterPoint): gsap.TweenVars => ({
  y: () => nozzle.y,
  x: () => nozzle.x,
  scale: PUFF_START_SCALE,
  opacity: 0,
})

const puffTravel = (nozzle: EmitterPoint, factor: number, index: number): gsap.TweenVars => ({
  y: () => nozzle.y + PUFF_RISE_Y_PX * factor,
  x: () => nozzle.x + (isLeadPuff(index) ? PUFF_LEAD_LANE_X_PX : PUFF_TRAIL_LANE_X_PX) * factor,
  scale: PUFF_END_SCALE,
  opacity: 0,
  duration: PUFF_RISE_DURATION_S,
  ease: PUFF_RISE_EASE,
  repeat: -1,
  repeatRefresh: true,
  immediateRender: false,
  keyframes: {opacity: PUFF_OPACITY_KEYFRAMES, easeEach: 'none'},
})

function createPuffTimeline(puffs: HTMLElement[], factor: number, nozzle: EmitterPoint): gsap.core.Timeline {
  gsap.set(puffs, {x: 0, y: 0, scale: PUFF_START_SCALE, opacity: 0})
  const timeline = gsap.timeline()
  puffs.forEach((puff, index) => {
    timeline.fromTo(puff, puffLaunch(nozzle), puffTravel(nozzle, factor, index), index * PUFF_RISE_STAGGER_S)
  })
  return timeline
}

function createSteamEffect(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const mouth = antennaTipAnchor(host, antenna, skin)
  const element = createTipShell(mouth, WILL_CHANGE_STYLE)
  const puffs = PUFF_INDEXES.map((index) => createPuff(factor, index))
  element.append(...puffs)
  host.append(element)
  return createNozzleEmitter({
    host,
    element,
    mouth,
    buildTimeline: (nozzle) => createPuffTimeline(puffs, factor, nozzle),
  })
}

export const steamEffect: EffectMount = (context) => createSteamEffect(context)
