import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const THOUGHT_CLOUD_INK_COLOR = '#2f3142'

const THOUGHT_CLOUD_PAPER_COLOR = '#f7f4ef'

const THOUGHT_CLOUD_BORDER_PX = 1

const THOUGHT_CLOUD_DOT_COUNT = 3

const THOUGHT_CLOUD_DOT_SIZE_PX = 4

const THOUGHT_CLOUD_DOT_PULSE_DURATION_S = 0.34

const THOUGHT_CLOUD_DOT_STAGGER_S = 0.2

const THOUGHT_CLOUD_DOT_EASE = 'power1.inOut'

const THOUGHT_CLOUD_FLOAT_Y_PX = -2.5

const THOUGHT_CLOUD_FLOAT_DURATION_S = 1.5

const THOUGHT_CLOUD_FLOAT_EASE = 'sine.inOut'

const THOUGHT_CLOUD_TRAIL_DOT_1 = {size: 4, left: -1, top: -9}

const THOUGHT_CLOUD_TRAIL_DOT_2 = {size: 6, left: 3, top: -21}

const THOUGHT_CLOUD_BUBBLE = {left: 6, top: -52, width: 38, height: 24, radius: 12, gap: 4}

const DOT_INDEXES = Array.from({length: THOUGHT_CLOUD_DOT_COUNT}, (_, index) => index)

function createTrailDot(factor: number, spec: {size: number; left: number; top: number}): HTMLElement {
  const dot = document.createElement('span')
  const size = spec.size * factor
  dot.style.cssText =
    `position:absolute;left:${spec.left * factor}px;top:${spec.top * factor}px;` +
    `width:${size}px;height:${size}px;border-radius:50%;background:${THOUGHT_CLOUD_PAPER_COLOR};` +
    `border:${THOUGHT_CLOUD_BORDER_PX}px solid ${THOUGHT_CLOUD_INK_COLOR}`
  return dot
}

function createDot(factor: number): HTMLElement {
  const dot = document.createElement('span')
  const size = THOUGHT_CLOUD_DOT_SIZE_PX * factor
  dot.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${THOUGHT_CLOUD_INK_COLOR}`
  return dot
}

function createCloud(factor: number): {cloud: HTMLElement; dots: HTMLElement[]} {
  const cloud = document.createElement('span')
  const bubble = THOUGHT_CLOUD_BUBBLE
  cloud.style.cssText =
    `position:absolute;left:${bubble.left * factor}px;top:${bubble.top * factor}px;` +
    `display:flex;align-items:center;justify-content:center;gap:${bubble.gap * factor}px;` +
    `width:${bubble.width * factor}px;height:${bubble.height * factor}px;` +
    `border-radius:${bubble.radius * factor}px;background:${THOUGHT_CLOUD_PAPER_COLOR};` +
    `border:${THOUGHT_CLOUD_BORDER_PX}px solid ${THOUGHT_CLOUD_INK_COLOR}`
  const dots = DOT_INDEXES.map(() => createDot(factor))
  cloud.append(...dots)
  return {cloud, dots}
}

function createFloatTimeline(cloud: HTMLElement, dots: HTMLElement[], factor: number): gsap.core.Timeline {
  gsap.set(dots, {opacity: 0.2})
  const timeline = gsap.timeline()
  timeline.fromTo(
    dots,
    {opacity: 0.2},
    {
      opacity: 1,
      duration: THOUGHT_CLOUD_DOT_PULSE_DURATION_S,
      stagger: THOUGHT_CLOUD_DOT_STAGGER_S,
      ease: THOUGHT_CLOUD_DOT_EASE,
      yoyo: true,
      repeat: -1,
    },
    0,
  )
  timeline.to(
    cloud,
    {
      y: THOUGHT_CLOUD_FLOAT_Y_PX * factor,
      duration: THOUGHT_CLOUD_FLOAT_DURATION_S,
      ease: THOUGHT_CLOUD_FLOAT_EASE,
      yoyo: true,
      repeat: -1,
    },
    0,
  )
  return timeline
}

function createThoughtCloudEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const trailDot1 = createTrailDot(factor, THOUGHT_CLOUD_TRAIL_DOT_1)
  const trailDot2 = createTrailDot(factor, THOUGHT_CLOUD_TRAIL_DOT_2)
  const {cloud, dots} = createCloud(factor)
  element.append(trailDot1, trailDot2, cloud)
  host.append(element)
  const timeline = createFloatTimeline(cloud, dots, factor)
  return createTimelineEmitter(element, timeline)
}

export const thoughtCloudEffect: EffectMount = (context) => createThoughtCloudEmitter(context)
