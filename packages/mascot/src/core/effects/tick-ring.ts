import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const TICK_RING_COUNT = 12

const TICK_RING_RADIUS_PX = 16

const TICK_RING_CENTER_TOP_PX = -19

const TICK_SIZE_PX = 3

const TICK_COLOR = 'var(--chat-accent, #e0218a)'

const TICK_REST_OPACITY = 0.18

const TICK_LIT_OPACITY = 1

const TICK_LIT_DURATION_S = 0.18

const TICK_STAGGER_S = 0.12

const TICK_INDEXES = Array.from({length: TICK_RING_COUNT}, (_, index) => index)

function tickAngle(index: number): number {
  return (index / TICK_RING_COUNT) * Math.PI * 2 - Math.PI / 2
}

function createTick(factor: number, index: number): HTMLElement {
  const angle = tickAngle(index)
  const size = TICK_SIZE_PX * factor
  const left = Math.cos(angle) * TICK_RING_RADIUS_PX * factor - size / 2
  const top = TICK_RING_CENTER_TOP_PX * factor + Math.sin(angle) * TICK_RING_RADIUS_PX * factor - size / 2
  const tick = document.createElement('span')
  tick.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${size}px;height:${size}px;background:${TICK_COLOR}`
  return tick
}

function createTickTimeline(ticks: HTMLElement[]): gsap.core.Timeline {
  gsap.set(ticks, {opacity: TICK_REST_OPACITY})
  return gsap.timeline().fromTo(
    ticks,
    {opacity: TICK_REST_OPACITY},
    {
      opacity: TICK_LIT_OPACITY,
      duration: TICK_LIT_DURATION_S,
      ease: 'steps(1)',
      stagger: {each: TICK_STAGGER_S, repeat: -1},
      yoyo: true,
      repeat: -1,
    },
    0,
  )
}

function createTickRingEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const ticks = TICK_INDEXES.map((index) => createTick(factor, index))
  element.append(...ticks)
  host.append(element)
  return createTimelineEmitter(host, element, () => createTickTimeline(ticks))
}

export const tickRingEffect: EffectMount = (context) => createTickRingEmitter(context)
