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

export type FollowParts = {
  eyes: HTMLElement
  antenna: HTMLElement
  leanWrapper: HTMLElement | undefined
  skin: MascotSkin
}

export type FollowController = {
  arm: (channels: FollowChannels) => void
  disarm: (animated: boolean) => void
  dispose: () => void
}

type GazeOrigin = {centerX: number; centerY: number; scaleX: number; scaleY: number}

type GazePoint = {clientX: number; clientY: number}

type GazeTracker = {handle: (event: PointerEvent) => void; detach: () => void}

type FollowDrivers = {
  moveEyesX: ((value: number) => void) | undefined
  moveEyesY: ((value: number) => void) | undefined
  leanTo: ((value: number) => void) | undefined
  pinLean: () => boolean
  tweens: gsap.core.Tween[]
}

const LEAN_WRAPPER_STYLE = 'position:absolute;inset:0;pointer-events:none;will-change:transform'

const leanPivotSettled = (): boolean => true

function pinLeanPivot(antenna: HTMLElement, wrapper: HTMLElement, skin: MascotSkin): boolean {
  if (antenna.offsetWidth === 0 || antenna.offsetHeight === 0) return false
  const origin = antennaOriginOffset(antenna, wrapper, skin)
  gsap.set(wrapper, {transformOrigin: `${origin.x}px ${origin.y}px`})
  return true
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
  return wrapper
}

function eyesDrivers(eyes: HTMLElement, armed: boolean): FollowDrivers {
  const idle = {moveEyesX: undefined, moveEyesY: undefined, leanTo: undefined, pinLean: leanPivotSettled}
  if (!armed) return {...idle, tweens: []}
  const eyesVars = {duration: GAZE_EYES_QUICK_TO_DURATION_S, ease: GAZE_EYES_QUICK_TO_EASE}
  const moveEyesX = gsap.quickTo(eyes, 'x', eyesVars)
  const moveEyesY = gsap.quickTo(eyes, 'y', eyesVars)
  return {...idle, moveEyesX, moveEyesY, tweens: [moveEyesX.tween, moveEyesY.tween]}
}

function createDrivers(parts: FollowParts, channels: FollowChannels): FollowDrivers {
  const {eyes, antenna, leanWrapper, skin} = parts
  const drivers = eyesDrivers(eyes, channels.eyes)
  if (!channels.antenna || leanWrapper === undefined) return drivers
  const leanTo = gsap.quickTo(leanWrapper, 'rotation', {
    duration: GAZE_WRAPPER_QUICK_TO_DURATION_S,
    ease: GAZE_WRAPPER_QUICK_TO_EASE,
  })
  return {
    ...drivers,
    leanTo,
    pinLean: () => pinLeanPivot(antenna, leanWrapper, skin),
    tweens: [...drivers.tweens, leanTo.tween],
  }
}

function measureGazeOrigin(eyes: HTMLElement): GazeOrigin | undefined {
  const bounds = eyes.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) return undefined
  return {
    centerX: bounds.left + bounds.width / 2 - gsapNumber(eyes, 'x'),
    centerY: bounds.top + bounds.height / 2 - gsapNumber(eyes, 'y'),
    scaleX: gsapNumber(eyes, 'scaleX'),
    scaleY: gsapNumber(eyes, 'scaleY'),
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
  let registered: gsap.Callback | undefined
  let pivoted = drivers.pinLean()

  const restingOrigin = (): GazeOrigin | undefined => {
    const held = origin
    if (held !== undefined && originHolds(eyes, held)) return held
    origin = measureGazeOrigin(eyes)
    return origin
  }

  const flush = () => {
    const point = pending
    pending = undefined
    if (point === undefined) return
    if (!pivoted) pivoted = drivers.pinLean()
    const measured = restingOrigin()
    if (measured === undefined) return
    aimAt(drivers, measured, point)
  }

  const handle = (event: PointerEvent) => {
    const scheduled = pending !== undefined
    pending = {clientX: event.clientX, clientY: event.clientY}
    if (scheduled) return
    registered = gsap.ticker.add(flush, true)
  }

  const forgetOrigin = () => {
    origin = undefined
  }

  const forgetMeasurements = () => {
    origin = undefined
    pivoted = false
  }

  window.addEventListener('scroll', forgetOrigin, {passive: true, capture: true})
  window.addEventListener('resize', forgetMeasurements, {passive: true})

  const detach = () => {
    window.removeEventListener('scroll', forgetOrigin, {capture: true})
    window.removeEventListener('resize', forgetMeasurements)
    if (registered !== undefined) gsap.ticker.remove(registered)
    registered = undefined
    pending = undefined
  }

  return {handle, detach}
}

export function createFollowController(parts: FollowParts): FollowController {
  const {eyes, leanWrapper} = parts
  let tracker: GazeTracker | undefined
  let ownedTweens: gsap.core.Tween[] = []
  let armedChannels: FollowChannels = NO_FOLLOW_CHANNELS

  const detach = () => {
    if (tracker === undefined) return
    window.removeEventListener('pointermove', tracker.handle)
    tracker.detach()
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
    const drivers = createDrivers(parts, channels)
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
    gsap.set(eyes, {x: 0, y: 0})
  }

  return {arm, disarm, dispose}
}
