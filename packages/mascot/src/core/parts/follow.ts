import gsap from 'gsap'
import {
  GAZE_ANTENNA_LEAN_DEG,
  GAZE_EYE_RANGE_PX,
  GAZE_EYES_QUICK_TO_DURATION_S,
  GAZE_EYES_QUICK_TO_EASE,
  GAZE_FALLOFF_PX,
  GAZE_WRAPPER_QUICK_TO_DURATION_S,
  GAZE_WRAPPER_QUICK_TO_EASE,
  reduceMotion,
} from '../config.js'

export type FollowParts = {eyes: HTMLElement; leanWrapper: HTMLElement | undefined}

export type FollowController = {
  arm: () => void
  disarm: (animated: boolean) => void
  dispose: () => void
}

type FollowDrivers = {
  moveEyesX: (value: number) => void
  moveEyesY: (value: number) => void
  leanTo: ((value: number) => void) | undefined
  tweens: gsap.core.Tween[]
}

const LEAN_WRAPPER_TRANSFORM_ORIGIN = '50% 32.8%'
const LEAN_WRAPPER_STYLE = 'position:absolute;inset:0;pointer-events:none;will-change:transform'
const RETURN_DURATION_S = 0.25
const RETURN_EASE = 'power2.out'

export function wrapForLean(antenna: HTMLElement): HTMLElement | undefined {
  const parent = antenna.parentElement
  if (parent === null) return undefined
  const wrapper = document.createElement('span')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = LEAN_WRAPPER_STYLE
  parent.insertBefore(wrapper, antenna)
  wrapper.append(antenna)
  gsap.set(wrapper, {transformOrigin: LEAN_WRAPPER_TRANSFORM_ORIGIN})
  return wrapper
}

function createDrivers(eyes: HTMLElement, leanWrapper: HTMLElement | undefined): FollowDrivers {
  const eyesVars = {duration: GAZE_EYES_QUICK_TO_DURATION_S, ease: GAZE_EYES_QUICK_TO_EASE}
  const moveEyesX = gsap.quickTo(eyes, 'x', eyesVars)
  const moveEyesY = gsap.quickTo(eyes, 'y', eyesVars)
  if (leanWrapper === undefined) {
    return {moveEyesX, moveEyesY, leanTo: undefined, tweens: [moveEyesX.tween, moveEyesY.tween]}
  }
  const leanTo = gsap.quickTo(leanWrapper, 'rotation', {
    duration: GAZE_WRAPPER_QUICK_TO_DURATION_S,
    ease: GAZE_WRAPPER_QUICK_TO_EASE,
  })
  return {moveEyesX, moveEyesY, leanTo, tweens: [moveEyesX.tween, moveEyesY.tween, leanTo.tween]}
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
    drivers.moveEyesX(Math.cos(angle) * reach * GAZE_EYE_RANGE_PX)
    drivers.moveEyesY(Math.sin(angle) * reach * GAZE_EYE_RANGE_PX)
    drivers.leanTo?.(Math.cos(angle) * reach * GAZE_ANTENNA_LEAN_DEG)
  }
}

export function createFollowController(parts: FollowParts): FollowController {
  const {eyes, leanWrapper} = parts
  let pointerMove: ((event: PointerEvent) => void) | undefined
  let ownedTweens: gsap.core.Tween[] = []

  const detach = () => {
    if (pointerMove === undefined) return
    window.removeEventListener('pointermove', pointerMove)
    pointerMove = undefined
  }

  const killOwnedTweens = () => {
    ownedTweens.forEach((tween) => tween.kill())
    ownedTweens = []
  }

  const arm = () => {
    if (reduceMotion() || pointerMove !== undefined) return
    killOwnedTweens()
    const drivers = createDrivers(eyes, leanWrapper)
    ownedTweens.push(...drivers.tweens)
    pointerMove = createPointerMove(eyes, drivers)
    window.addEventListener('pointermove', pointerMove)
  }

  const zero = () => {
    gsap.set(eyes, {x: 0, y: 0})
    if (leanWrapper !== undefined) gsap.set(leanWrapper, {rotation: 0})
  }

  const animateToZero = () => {
    ownedTweens.push(gsap.to(eyes, {x: 0, y: 0, duration: RETURN_DURATION_S, ease: RETURN_EASE}))
    if (leanWrapper === undefined) return
    ownedTweens.push(gsap.to(leanWrapper, {rotation: 0, duration: RETURN_DURATION_S, ease: RETURN_EASE}))
  }

  const disarm = (animated: boolean) => {
    detach()
    killOwnedTweens()
    if (animated) return animateToZero()
    zero()
  }

  const dispose = () => {
    detach()
    killOwnedTweens()
  }

  return {arm, disarm, dispose}
}
