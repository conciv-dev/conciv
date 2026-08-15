import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const LED_CONE_PULSE_DURATION_S = 0.5

const LED_CONE_COLOR = 'var(--pw-accent, #e0218a)'

const LED_CONE_HALF_WIDTH_PX = 12

const LED_CONE_LEFT_PX = -12

const LED_CONE_TOP_PX = -35

const LED_CONE_HEIGHT_PX = 27

const LED_CONE_REST_OPACITY = 0.18

const LED_CONE_PULSE_OPACITY = 0.08

const LED_DOT_SIZE_PX = 6

const LED_DOT_LEFT_PX = -3

const LED_DOT_TOP_PX = -9

const LED_DOT_PULSE_OPACITY = 0.25

function createCone(factor: number): HTMLElement {
  const cone = document.createElement('span')
  cone.style.cssText =
    `position:absolute;left:${LED_CONE_LEFT_PX * factor}px;top:${LED_CONE_TOP_PX * factor}px;width:0;height:0;` +
    `border-left:${LED_CONE_HALF_WIDTH_PX * factor}px solid transparent;` +
    `border-right:${LED_CONE_HALF_WIDTH_PX * factor}px solid transparent;` +
    `border-bottom:${LED_CONE_HEIGHT_PX * factor}px solid ${LED_CONE_COLOR};opacity:${LED_CONE_REST_OPACITY}`
  return cone
}

function createLed(factor: number): HTMLElement {
  const led = document.createElement('span')
  led.style.cssText =
    `position:absolute;left:${LED_DOT_LEFT_PX * factor}px;top:${LED_DOT_TOP_PX * factor}px;` +
    `width:${LED_DOT_SIZE_PX * factor}px;height:${LED_DOT_SIZE_PX * factor}px;background:${LED_CONE_COLOR}`
  return led
}

function createPulseTimeline(led: HTMLElement, cone: HTMLElement): gsap.core.Timeline {
  const timeline = gsap.timeline()
  timeline.to(
    led,
    {opacity: LED_DOT_PULSE_OPACITY, duration: LED_CONE_PULSE_DURATION_S, ease: 'steps(1)', yoyo: true, repeat: -1},
    0,
  )
  timeline.to(
    cone,
    {opacity: LED_CONE_PULSE_OPACITY, duration: LED_CONE_PULSE_DURATION_S, ease: 'sine.inOut', yoyo: true, repeat: -1},
    0,
  )
  return timeline
}

function createLedConeEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const cone = createCone(factor)
  const led = createLed(factor)
  element.append(cone, led)
  host.append(element)
  return createTimelineEmitter(host, element, () => createPulseTimeline(led, cone))
}

export const ledConeEffect: EffectMount = (context) => createLedConeEmitter(context)
