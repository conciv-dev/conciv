import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SIGNAL_RINGS_COLOR = 'var(--pw-accent, #e0218a)'

const RING_COUNT = 3

const RING_INDEXES = Array.from({length: RING_COUNT}, (_, index) => index)

const RING_SIZE_PX = 22

const RING_LEFT_PX = -11

const RING_TOP_PX = -17

const RING_BORDER_WIDTH_PX = 2

const RING_INITIAL_SCALE_BASE = 0.6

const RING_INITIAL_SCALE_STEP = 0.7

const RING_INITIAL_OPACITY_BASE = 0.8

const RING_INITIAL_OPACITY_STEP = 0.25

const RING_PULSE_START_SCALE = 0.25

const RING_PULSE_START_OPACITY = 0.95

const RING_PULSE_END_SCALE = 2.8

const RING_PULSE_END_OPACITY = 0

const RING_PULSE_DURATION_S = 1.6

const RING_PULSE_EASE = 'power1.out'

const RING_PULSE_STAGGER_S = 0.5

const ringInitialScale = (index: number): number => RING_INITIAL_SCALE_BASE + index * RING_INITIAL_SCALE_STEP

const ringInitialOpacity = (index: number): number => RING_INITIAL_OPACITY_BASE - index * RING_INITIAL_OPACITY_STEP

function createRing(factor: number, index: number): HTMLElement {
  const ring = document.createElement('span')
  ring.style.cssText =
    `position:absolute;left:${RING_LEFT_PX * factor}px;top:${RING_TOP_PX * factor}px;` +
    `width:${RING_SIZE_PX * factor}px;height:${RING_SIZE_PX * factor}px;border-radius:50%;` +
    `border:${RING_BORDER_WIDTH_PX * factor}px solid ${SIGNAL_RINGS_COLOR};` +
    `opacity:${ringInitialOpacity(index)};transform:scale(${ringInitialScale(index)})`
  return ring
}

function createPulseTimeline(rings: HTMLElement[]): gsap.core.Timeline {
  return gsap.timeline().fromTo(
    rings,
    {scale: RING_PULSE_START_SCALE, opacity: RING_PULSE_START_OPACITY},
    {
      scale: RING_PULSE_END_SCALE,
      opacity: RING_PULSE_END_OPACITY,
      duration: RING_PULSE_DURATION_S,
      ease: RING_PULSE_EASE,
      stagger: {each: RING_PULSE_STAGGER_S, repeat: -1},
    },
    0,
  )
}

function createSignalRingsEffect(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const rings = RING_INDEXES.map((index) => createRing(factor, index))
  element.append(...rings)
  host.append(element)
  const timeline = createPulseTimeline(rings)
  return createTimelineEmitter(element, timeline)
}

export const signalRingsEffect: EffectMount = (context) => createSignalRingsEffect(context)
