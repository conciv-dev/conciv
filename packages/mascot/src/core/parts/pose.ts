import gsap from 'gsap'
import {AWAKE_EYE_REST_SCALE_Y, type MascotState} from '../config.js'

export type PoseParts = {head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

export type PoseController = {
  set: (state: MascotState) => void
  animateTo: (state: MascotState) => void
  eyeRestScaleY: () => number
  dispose: () => void
}

const HEAD_ORIGIN = '50% 80%'
const EYES_ORIGIN = '49.6% 58.6%'
const ANTENNA_ORIGIN = '50% 32.8%'

const HEAD_POSED_PROPERTIES = 'yPercent,rotation,scaleX,scaleY'
const EYES_POSED_PROPERTIES = 'scaleX,scaleY'
const ANTENNA_POSED_PROPERTIES = 'rotation,scaleX,scaleY'

const REST_EYE_SCALE_Y = 1
const AWAKE_HEAD_Y_PERCENT = -2
const AWAKE_ANTENNA_ROTATION_DEG = -4

export function createPoseController(parts: PoseParts): PoseController {
  const {head, eyes, antenna} = parts
  let timeline: gsap.core.Timeline | undefined
  let current: MascotState = 'rest'

  gsap.set(head, {transformOrigin: HEAD_ORIGIN})
  gsap.set(eyes, {transformOrigin: EYES_ORIGIN})
  gsap.set(antenna, {transformOrigin: ANTENNA_ORIGIN})

  const killTimeline = () => {
    timeline?.kill()
    timeline = undefined
  }

  const killPosedTweens = () => {
    gsap.killTweensOf(head, HEAD_POSED_PROPERTIES)
    gsap.killTweensOf(eyes, EYES_POSED_PROPERTIES)
    gsap.killTweensOf(antenna, ANTENNA_POSED_PROPERTIES)
  }

  const setRestPose = () => {
    gsap.set(head, {yPercent: 0, rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: REST_EYE_SCALE_Y})
    gsap.set(antenna, {rotation: 0, scaleX: 1, scaleY: 1})
  }

  const setAwakePose = () => {
    gsap.set(head, {yPercent: AWAKE_HEAD_Y_PERCENT, rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: AWAKE_EYE_REST_SCALE_Y})
    gsap.set(antenna, {rotation: AWAKE_ANTENNA_ROTATION_DEG})
  }

  const playAwake = () =>
    gsap
      .timeline()
      .to(head, {yPercent: 6, scaleX: 1.05, scaleY: 0.92, duration: 0.08, ease: 'power2.in'})
      .to(antenna, {rotation: 9, duration: 0.08, ease: 'power2.in'}, '<')
      .to(head, {yPercent: -7, scaleX: 0.98, scaleY: 1.08, rotation: -4, duration: 0.2, ease: 'expo.out'})
      .to(eyes, {scaleY: 1.28, scaleX: 1.12, duration: 0.14, ease: 'expo.out'}, '<')
      .to(antenna, {rotation: -11, duration: 0.2, ease: 'expo.out'}, '<0.04')
      .to(head, {
        yPercent: AWAKE_HEAD_Y_PERCENT,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        duration: 0.26,
        ease: 'power3.out',
      })
      .to(eyes, {scaleY: AWAKE_EYE_REST_SCALE_Y, scaleX: 1, duration: 0.22, ease: 'power2.out'}, '<')
      .to(antenna, {rotation: AWAKE_ANTENNA_ROTATION_DEG, duration: 0.34, ease: 'power2.out'}, '<')

  const playRest = () =>
    gsap
      .timeline()
      .to(head, {yPercent: 4, scaleY: 0.95, duration: 0.07, ease: 'power2.in'})
      .to(head, {yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.2, ease: 'power3.out'})
      .to(eyes, {scaleX: 1, scaleY: REST_EYE_SCALE_Y, duration: 0.16, ease: 'power2.out'}, '<')
      .to(antenna, {rotation: 0, scaleX: 1, scaleY: 1, duration: 0.22, ease: 'power2.out'}, '<')

  const set = (state: MascotState) => {
    killTimeline()
    killPosedTweens()
    current = state
    if (state === 'awake') return setAwakePose()
    setRestPose()
  }

  const animateTo = (state: MascotState) => {
    killTimeline()
    killPosedTweens()
    current = state
    timeline = state === 'awake' ? playAwake() : playRest()
  }

  const eyeRestScaleY = () => (current === 'awake' ? AWAKE_EYE_REST_SCALE_Y : REST_EYE_SCALE_Y)

  const dispose = () => {
    killTimeline()
    killPosedTweens()
    setRestPose()
  }

  return {set, animateTo, eyeRestScaleY, dispose}
}
