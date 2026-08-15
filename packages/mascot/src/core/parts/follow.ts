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
import {antennaOriginOffset, gsapNumber} from '../tip-anchor.js'

export type FollowParts = {eyes: HTMLElement; leanWrapper: HTMLElement | undefined}

export type FollowController = {
  arm: (channels: FollowChannels) => void
  disarm: (animated: boolean) => void
  dispose: () => void
}

type GazeOrigin = {centerX: number; centerY: number; width: number; height: number; scaleX: number; scaleY: number}

type GazePoint = {clientX: number; clientY: number}

type GazeTracker = {handle: (event: PointerEvent) => void; cancel: () => void}

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
  gsap.set(wrapper, {transformOrigin: skin.transformOrigins.antenna})
  requestAnimationFrame(() => {
    if (!wrapper.isConnected) return
    gsap.set(wrapper, {transformOrigin: leanOrigin(antenna, wrapper, skin)})
  })
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

function measureGazeOrigin(eyes: HTMLElement): GazeOrigin {
  const bounds = eyes.getBoundingClientRect()
  const scaleX = gsapNumber(eyes, 'scaleX')
  const scaleY = gsapNumber(eyes, 'scaleY')
  return {
    centerX: bounds.left + bounds.width / 2 - gsapNumber(eyes, 'x'),
    centerY: bounds.top + bounds.height / 2 - gsapNumber(eyes, 'y'),
    width: bounds.width / scaleX,
    height: bounds.height / scaleY,
    scaleX,
    scaleY,
  }
}

const originHolds = (eyes: HTMLElement, origin: GazeOrigin): boolean =>
  origin.scaleX === gsapNumber(eyes, 'scaleX') && origin.scaleY === gsapNumber(eyes, 'scaleY')

function aimAt(drivers: FollowDrivers, origin: GazeOrigin, point: GazePoint): void {
  const offsetX = point.clientX - origin.centerX
  const offsetY = point.clientY - origin.centerY
  const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
  const reach = Math.min(1, distance / GAZE_FALLOFF_PX)
  const angle = Math.atan2(offsetY, offsetX)
  drivers.moveEyesX?.(Math.cos(angle) * reach * GAZE_EYE_RANGE_PX)
  drivers.moveEyesY?.(Math.sin(angle) * reach * GAZE_EYE_RANGE_PX)
  drivers.leanTo?.(Math.cos(angle) * reach * GAZE_ANTENNA_LEAN_DEG)
}

function createGazeTracker(eyes: HTMLElement, drivers: FollowDrivers): GazeTracker {
  let origin: GazeOrigin | undefined
  let pending: GazePoint | undefined

  const restingOrigin = (): GazeOrigin => {
    const held = origin
    if (held !== undefined && originHolds(eyes, held)) return held
    origin = measureGazeOrigin(eyes)
    return origin
  }

  const flush = () => {
    const point = pending
    pending = undefined
    if (point === undefined) return
    const measured = restingOrigin()
    if (measured.width === 0 || measured.height === 0) return
    aimAt(drivers, measured, point)
  }

  const handle = (event: PointerEvent) => {
    const scheduled = pending !== undefined
    pending = {clientX: event.clientX, clientY: event.clientY}
    if (!scheduled) gsap.ticker.add(flush, true)
  }

  const cancel = () => {
    pending = undefined
  }

  return {handle, cancel}
}

export function createFollowController(parts: FollowParts): FollowController {
  const {eyes, leanWrapper} = parts
  let tracker: GazeTracker | undefined
  let ownedTweens: gsap.core.Tween[] = []
  let armedChannels: FollowChannels = NO_FOLLOW_CHANNELS

  const detach = () => {
    if (tracker === undefined) return
    window.removeEventListener('pointermove', tracker.handle)
    tracker.cancel()
    tracker = undefined
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
    tracker = createGazeTracker(eyes, drivers)
    window.addEventListener('pointermove', tracker.handle, {passive: true})
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
