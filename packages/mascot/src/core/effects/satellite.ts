import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SATELLITE_ORBIT_DURATION_S = 2.6

const SATELLITE_RING_SIZE_PX = 34

const SATELLITE_RING_LEFT_PX = -17

const SATELLITE_RING_TOP_PX = -35

const SATELLITE_RING_BORDER_PX = 1

const SATELLITE_RING_BORDER_COLOR = 'rgba(128, 134, 156, 0.45)'

const SATELLITE_ORBIT_TOP_PX = -18

const SATELLITE_DOT_SIZE_PX = 5

const SATELLITE_DOT_LEFT_PX = -2

const SATELLITE_DOT_TOP_PX = -19

const SATELLITE_DOT_COLOR = 'var(--pw-accent, #e0218a)'

function createRing(factor: number): HTMLElement {
  const ring = document.createElement('span')
  ring.style.cssText =
    `position:absolute;left:${SATELLITE_RING_LEFT_PX * factor}px;top:${SATELLITE_RING_TOP_PX * factor}px;` +
    `width:${SATELLITE_RING_SIZE_PX * factor}px;height:${SATELLITE_RING_SIZE_PX * factor}px;border-radius:50%;` +
    `border:${SATELLITE_RING_BORDER_PX * factor}px dashed ${SATELLITE_RING_BORDER_COLOR}`
  return ring
}

function createDot(factor: number): HTMLElement {
  const dot = document.createElement('span')
  dot.style.cssText =
    `position:absolute;left:${SATELLITE_DOT_LEFT_PX * factor}px;top:${SATELLITE_DOT_TOP_PX * factor}px;` +
    `width:${SATELLITE_DOT_SIZE_PX * factor}px;height:${SATELLITE_DOT_SIZE_PX * factor}px;` +
    `background:${SATELLITE_DOT_COLOR}`
  return dot
}

function createOrbit(factor: number): HTMLElement {
  const orbit = document.createElement('span')
  orbit.style.cssText = `position:absolute;left:0;top:${SATELLITE_ORBIT_TOP_PX * factor}px;will-change:transform`
  orbit.append(createDot(factor))
  return orbit
}

function createOrbitTimeline(orbit: HTMLElement): gsap.core.Timeline {
  return gsap.timeline().to(orbit, {rotation: 360, duration: SATELLITE_ORBIT_DURATION_S, ease: 'none', repeat: -1})
}

function createSatelliteEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const orbit = createOrbit(factor)
  element.append(createRing(factor), orbit)
  host.append(element)
  return createTimelineEmitter(host, element, () => createOrbitTimeline(orbit))
}

export const satelliteEffect: EffectMount = (context) => createSatelliteEmitter(context)
