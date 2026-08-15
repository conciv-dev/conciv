import gsap from 'gsap'
import {
  type FollowChannels,
  GAZE_ANTENNA_LEAN_DEG,
  GAZE_EYE_RANGE_PX,
  GAZE_EYES_QUICK_TO_DURATION_S,
  GAZE_EYES_QUICK_TO_EASE,
  GAZE_FALLOFF_PX,
  GAZE_RETURN_DURATION_S,
  GAZE_RETURN_EASE,
  GAZE_WRAPPER_QUICK_TO_DURATION_S,
  GAZE_WRAPPER_QUICK_TO_EASE,
  NO_FOLLOW_CHANNELS,
  reduceMotion,
  sameFollowChannels,
} from '../config.js'
import type {MascotSkin} from '../skin.js'
import {antennaOriginOffset} from '../tip-anchor.js'

export type FollowParts = {eyes: HTMLElement; leanWrapper: HTMLElement | undefined}

export type FollowController = {
  arm: (channels: FollowChannels) => void
  disarm: (animated: boolean) => void
  dispose: () => void
}

type FollowDrivers = {
  moveEyesX: ((value: number) => void) | undefined
  moveEyesY: ((value: number) => void) | undefined
  leanTo: ((value: number) => void) | undefined
  tweens: gsap.core.Tween[]
}

const LEAN_WRAPPER_STYLE = 'position:absolute;inset:0;pointer-events:none;will-change:transform'

function leanOrigin(antenna: HTMLElement, wrapper: HTMLElement, skin: MascotSkin): string {
  if (antenna.offsetWidth === 0 || antenna.offsetHeight === 0) return skin.transformOrigins.antenna
  const origin = antennaOriginOffset(antenna, wrapper, skin)
  return `${origin.x}px ${origin.y}px`
}

export function wrapForLean(antenna: HTMLElement, skin: MascotSkin): HTMLElement | undefined {
  const parent = antenna.parentElement
  if (parent === null) return undefined
  const wrapper = document.createElement('span')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = LEAN_WRAPPER_STYLE
  parent.insertBefore(wrapper, antenna)
  wrapper.append(antenna)
  gsap.set(wrapper, {transformOrigin: leanOrigin(antenna, wrapper, skin)})
  return wrapper
}

function eyesDrivers(eyes: HTMLElement, armed: boolean): FollowDrivers {
  if (!armed) return {moveEyesX: undefined, moveEyesY: undefined, leanTo: undefined, tweens: []}
  const eyesVars = {duration: GAZE_EYES_QUICK_TO_DURATION_S, ease: GAZE_EYES_QUICK_TO_EASE}
  const moveEyesX = gsap.quickTo(eyes, 'x', eyesVars)
  const moveEyesY = gsap.quickTo(eyes, 'y', eyesVars)
  return {moveEyesX, moveEyesY, leanTo: undefined, tweens: [moveEyesX.tween, moveEyesY.tween]}
}

function createDrivers(
  eyes: HTMLElement,
  leanWrapper: HTMLElement | undefined,
  channels: FollowChannels,
): FollowDrivers {
  const drivers = eyesDrivers(eyes, channels.eyes)
  if (!channels.antenna || leanWrapper === undefined) return drivers
  const leanTo = gsap.quickTo(leanWrapper, 'rotation', {
    duration: GAZE_WRAPPER_QUICK_TO_DURATION_S,
    ease: GAZE_WRAPPER_QUICK_TO_EASE,
  })
  return {...drivers, leanTo, tweens: [...drivers.tweens, leanTo.tween]}
}

function createPointerMove(eyes: HTMLElement, drivers: FollowDrivers): (event: PointerEvent) => void {
  return (event) => {
    const bounds = eyes.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const offsetX = event.clientX - (bounds.left + bounds.width / 2)
    const offsetY = event.clientY - (bounds.top + bounds.height / 2)
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
    const reach = Math.min(1, distance / GAZE_FALLOFF_PX)
    const angle = Math.atan2(offsetY, offsetX)
    drivers.moveEyesX?.(Math.cos(angle) * reach * GAZE_EYE_RANGE_PX)
    drivers.moveEyesY?.(Math.sin(angle) * reach * GAZE_EYE_RANGE_PX)
    drivers.leanTo?.(Math.cos(angle) * reach * GAZE_ANTENNA_LEAN_DEG)
  }
}

export function createFollowController(parts: FollowParts): FollowController {
  const {eyes, leanWrapper} = parts
  let pointerMove: ((event: PointerEvent) => void) | undefined
  let ownedTweens: gsap.core.Tween[] = []
  let armedChannels: FollowChannels = NO_FOLLOW_CHANNELS

  const detach = () => {
    if (pointerMove === undefined) return
    window.removeEventListener('pointermove', pointerMove)
    pointerMove = undefined
  }

  const killOwnedTweens = () => {
    ownedTweens.forEach((tween) => tween.kill())
    ownedTweens = []
  }

  const releaseEyes = (animated: boolean) => {
    if (!animated) return gsap.set(eyes, {x: 0, y: 0})
    ownedTweens.push(gsap.to(eyes, {x: 0, y: 0, duration: GAZE_RETURN_DURATION_S, ease: GAZE_RETURN_EASE}))
  }

  const releaseLean = (animated: boolean) => {
    if (leanWrapper === undefined) return
    if (!animated) return gsap.set(leanWrapper, {rotation: 0})
    ownedTweens.push(gsap.to(leanWrapper, {rotation: 0, duration: GAZE_RETURN_DURATION_S, ease: GAZE_RETURN_EASE}))
  }

  const bindPointerMove = (channels: FollowChannels) => {
    const drivers = createDrivers(eyes, leanWrapper, channels)
    ownedTweens.push(...drivers.tweens)
    pointerMove = createPointerMove(eyes, drivers)
    window.addEventListener('pointermove', pointerMove)
  }

  const applyChannels = (channels: FollowChannels, animated: boolean) => {
    detach()
    killOwnedTweens()
    armedChannels = channels
    if (!channels.eyes) releaseEyes(animated)
    if (!channels.antenna) releaseLean(animated)
    if (channels.eyes || channels.antenna) bindPointerMove(channels)
  }

  const arm = (channels: FollowChannels) => {
    if (reduceMotion() || sameFollowChannels(armedChannels, channels)) return
    applyChannels(channels, true)
  }

  const disarm = (animated: boolean) => applyChannels(NO_FOLLOW_CHANNELS, animated)

  const dispose = () => {
    detach()
    killOwnedTweens()
    armedChannels = NO_FOLLOW_CHANNELS
  }

  return {arm, disarm, dispose}
}
