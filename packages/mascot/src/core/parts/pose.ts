import gsap from 'gsap'
import {type MascotState, REST_EYE_SCALE_Y, REST_HEAD_Y_PERCENT} from '../config.js'
import type {MascotSkin} from '../skin.js'

export type PoseParts = {head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

export type PoseController = {
  set: (state: MascotState) => void
  animateTo: (state: MascotState) => void
  eyeRestScaleY: () => number
  headRestYPercent: () => number
  dispose: () => void
}

const HEAD_POSED_PROPERTIES = 'rotation,scaleX,scaleY'
const EYES_POSED_PROPERTIES = 'scaleX'
const ANTENNA_POSED_PROPERTIES = 'rotation'

const AWAKE_ANTICIPATION: gsap.TweenVars = {yPercent: 6, duration: 0.08, ease: 'power2.in'}
const AWAKE_STRETCH: gsap.TweenVars = {yPercent: -7, duration: 0.2, ease: 'expo.out'}
const REST_ANTICIPATION: gsap.TweenVars = {yPercent: 4, duration: 0.07, ease: 'power2.in'}
const REST_SETTLE: gsap.TweenVars = {yPercent: REST_HEAD_Y_PERCENT, duration: 0.2, ease: 'power3.out'}

export function createPoseController(parts: PoseParts, skin: MascotSkin): PoseController {
  const {head, eyes, antenna} = parts
  const riders = [eyes, antenna]
  const awakeEyeScaleY = skin.awakeEyeRestScaleY
  const awakeHeadY = skin.awakeHeadYPercent
  const awakeAntennaRotation = skin.awakeAntennaRotationDeg
  const awakeSettle: gsap.TweenVars = {yPercent: awakeHeadY, duration: 0.26, ease: 'power3.out'}
  let timeline: gsap.core.Timeline | undefined
  let current: MascotState = 'rest'

  gsap.set(head, {transformOrigin: skin.transformOrigins.head})
  gsap.set(eyes, {transformOrigin: skin.transformOrigins.eyes})
  gsap.set(antenna, {transformOrigin: skin.transformOrigins.antenna})

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
    gsap.set([head, ...riders], {yPercent: REST_HEAD_Y_PERCENT})
    gsap.set(head, {rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: REST_EYE_SCALE_Y})
    gsap.set(antenna, {rotation: 0, scaleX: 1, scaleY: 1})
  }

  const setAwakePose = () => {
    gsap.set([head, ...riders], {yPercent: awakeHeadY})
    gsap.set(head, {rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: awakeEyeScaleY})
    gsap.set(antenna, {rotation: awakeAntennaRotation})
  }

  const playAwake = () =>
    gsap
      .timeline()
      .to(head, {...AWAKE_ANTICIPATION, scaleX: 1.05, scaleY: 0.92})
      .to(riders, {...AWAKE_ANTICIPATION}, '<')
      .to(antenna, {rotation: 9, duration: 0.08, ease: 'power2.in'}, '<')
      .to(head, {...AWAKE_STRETCH, scaleX: 0.98, scaleY: 1.08, rotation: -4})
      .to(riders, {...AWAKE_STRETCH}, '<')
      .to(eyes, {scaleY: 1.28, scaleX: 1.12, duration: 0.14, ease: 'expo.out'}, '<')
      .to(antenna, {rotation: -11, duration: 0.2, ease: 'expo.out'}, '<0.04')
      .to(head, {...awakeSettle, scaleX: 1, scaleY: 1, rotation: 0})
      .to(riders, {...awakeSettle}, '<')
      .to(eyes, {scaleY: awakeEyeScaleY, scaleX: 1, duration: 0.22, ease: 'power2.out'}, '<')
      .to(antenna, {rotation: awakeAntennaRotation, duration: 0.34, ease: 'power2.out'}, '<')

  const playRest = () =>
    gsap
      .timeline()
      .to(head, {...REST_ANTICIPATION, scaleY: 0.95})
      .to(riders, {...REST_ANTICIPATION}, '<')
      .to(head, {...REST_SETTLE, scaleX: 1, scaleY: 1, rotation: 0})
      .to(riders, {...REST_SETTLE}, '<')
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

  const eyeRestScaleY = () => (current === 'awake' ? awakeEyeScaleY : REST_EYE_SCALE_Y)

  const headRestYPercent = () => (current === 'awake' ? awakeHeadY : REST_HEAD_Y_PERCENT)

  const dispose = () => {
    killTimeline()
    killPosedTweens()
    setRestPose()
    current = 'rest'
  }

  return {set, animateTo, eyeRestScaleY, headRestYPercent, dispose}
}
