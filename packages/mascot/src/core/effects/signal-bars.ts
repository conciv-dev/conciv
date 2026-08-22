import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SIGNAL_BARS_COUNT = 4
const SIGNAL_BARS_WIDTH_PX = 4
const SIGNAL_BARS_LEFT_BASE_PX = -12
const SIGNAL_BARS_LEFT_STEP_PX = 6
const SIGNAL_BARS_TOP_BASE_PX = -11
const SIGNAL_BARS_HEIGHT_STEP_PX = 4
const SIGNAL_BARS_COLOR = 'var(--chat-accent, #e0218a)'
const SIGNAL_BARS_PULSE_DURATION_S = 0.22
const SIGNAL_BARS_STAGGER_S = 0.22
const SIGNAL_BARS_DIM_OPACITY = 0.2

const BAR_INDEXES = Array.from({length: SIGNAL_BARS_COUNT}, (_, index) => index)

function createBar(factor: number, index: number): HTMLElement {
  const bar = document.createElement('span')
  const left = (SIGNAL_BARS_LEFT_BASE_PX + index * SIGNAL_BARS_LEFT_STEP_PX) * factor
  const height = (index + 1) * SIGNAL_BARS_HEIGHT_STEP_PX * factor
  const top = SIGNAL_BARS_TOP_BASE_PX * factor - height
  const width = SIGNAL_BARS_WIDTH_PX * factor
  bar.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:${SIGNAL_BARS_COLOR}`
  return bar
}

function createPulseTimeline(bars: HTMLElement[]): gsap.core.Timeline {
  gsap.set(bars, {opacity: SIGNAL_BARS_DIM_OPACITY})
  return gsap.timeline().fromTo(
    bars,
    {opacity: SIGNAL_BARS_DIM_OPACITY},
    {
      opacity: 1,
      duration: SIGNAL_BARS_PULSE_DURATION_S,
      ease: 'steps(1)',
      stagger: {each: SIGNAL_BARS_STAGGER_S, repeat: -1},
      yoyo: true,
      repeat: -1,
    },
    0,
  )
}

function createSignalBarsEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const bars = BAR_INDEXES.map((index) => createBar(factor, index))
  element.append(...bars)
  host.append(element)
  return createTimelineEmitter(host, element, () => createPulseTimeline(bars))
}

export const signalBarsEffect: EffectMount = (context) => createSignalBarsEmitter(context)
