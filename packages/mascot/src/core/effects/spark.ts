import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SPARK_COLOR = '#ffd23f'

const SPARK_SEGMENT_COUNT = 5

const SPARK_SEGMENT_SIZE_PX = 4

const SPARK_SEGMENT_TOP_BASE_PX = -6

const SPARK_SEGMENT_TOP_STEP_PX = 6

const SPARK_SEGMENT_LEFT_EVEN_PX = -4

const SPARK_SEGMENT_LEFT_ODD_PX = 2

const SPARK_FLICKER_DURATION_S = 0.08

const SPARK_FLICKER_STAGGER_S = 0.06

const SPARK_FLICKER_OPACITY_FROM = 0.15

const SPARK_GLOW_CORE_COLOR = 'rgba(255, 210, 63, 1)'

const SPARK_GLOW_EDGE_COLOR = 'rgba(255, 210, 63, 0)'

const SPARK_GLOW_CORE_STOP = '32%'

const SPARK_GLOW_EDGE_STOP = '100%'

const SPARK_GLOW_SIZE_PX = 22

const SPARK_GLOW_LEFT_PX = -11

const SPARK_GLOW_TOP_PX = -13

const SPARK_GLOW_SCALE_FROM = 0.7

const SPARK_GLOW_SCALE_TO = 1.5

const SPARK_GLOW_OPACITY_FROM = 0.2

const SPARK_GLOW_OPACITY_TO = 0.75

const SPARK_GLOW_DURATION_S = 0.42

const SEGMENT_INDEXES = Array.from({length: SPARK_SEGMENT_COUNT}, (_, index) => index)

function createGlow(factor: number): HTMLElement {
  const glow = document.createElement('span')
  const size = SPARK_GLOW_SIZE_PX * factor
  glow.style.cssText =
    `position:absolute;left:${SPARK_GLOW_LEFT_PX * factor}px;top:${SPARK_GLOW_TOP_PX * factor}px;` +
    `width:${size}px;height:${size}px;` +
    `background:radial-gradient(circle closest-side,${SPARK_GLOW_CORE_COLOR} ${SPARK_GLOW_CORE_STOP},` +
    `${SPARK_GLOW_EDGE_COLOR} ${SPARK_GLOW_EDGE_STOP});opacity:0.5`
  return glow
}

function createSegment(factor: number, index: number): HTMLElement {
  const segment = document.createElement('span')
  const left = (index % 2 === 0 ? SPARK_SEGMENT_LEFT_EVEN_PX : SPARK_SEGMENT_LEFT_ODD_PX) * factor
  const top = (SPARK_SEGMENT_TOP_BASE_PX - index * SPARK_SEGMENT_TOP_STEP_PX) * factor
  const size = SPARK_SEGMENT_SIZE_PX * factor
  segment.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${size}px;height:${size}px;background:${SPARK_COLOR}`
  return segment
}

function createSparkTimeline(glow: HTMLElement, segments: HTMLElement[]): gsap.core.Timeline {
  const timeline = gsap.timeline()
  timeline.fromTo(
    segments,
    {opacity: SPARK_FLICKER_OPACITY_FROM},
    {
      opacity: 1,
      duration: SPARK_FLICKER_DURATION_S,
      stagger: {each: SPARK_FLICKER_STAGGER_S, repeat: -1},
      ease: 'steps(1)',
      yoyo: true,
      repeat: -1,
    },
    0,
  )
  timeline.fromTo(
    glow,
    {scale: SPARK_GLOW_SCALE_FROM, opacity: SPARK_GLOW_OPACITY_FROM},
    {
      scale: SPARK_GLOW_SCALE_TO,
      opacity: SPARK_GLOW_OPACITY_TO,
      duration: SPARK_GLOW_DURATION_S,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    },
    0,
  )
  return timeline
}

function createSparkEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const glow = createGlow(factor)
  const segments = SEGMENT_INDEXES.map((index) => createSegment(factor, index))
  element.append(glow, ...segments)
  host.append(element)
  return createTimelineEmitter(host, element, () => createSparkTimeline(glow, segments))
}

export const sparkEffect: EffectMount = (context) => createSparkEmitter(context)
