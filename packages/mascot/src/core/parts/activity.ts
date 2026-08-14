import gsap from 'gsap'
import {
  BLINK_BEATS,
  BLINK_CLOSE_DURATION_S,
  BLINK_CLOSE_EASE,
  BLINK_CLOSE_SCALE_Y,
  BLINK_OPEN_DURATION_S,
  BLINK_OPEN_EASE,
  reduceMotion,
  THROB_BEATS,
  THROB_EASE,
  THROB_SCALE_X,
  THROB_SCALE_Y,
  TIP_FRACTION_X,
  TIP_FRACTION_Y,
} from '../config.js'
import {createBinaryEmitter, type BinaryEmitter} from '../effects/binary.js'
import type {EmitterAnchor} from '../path.js'

export type ActivityParts = {stage: HTMLElement; antenna: HTMLElement; eyes: HTMLElement}

export type ActivityController = {
  start: (eyeRestScaleY: number) => void
  stop: () => void
  dispose: () => void
}

const THROB_RISE_DURATION_S = 0.3
const THROB_RISE_EASE = 'power2.out'
const THROB_RETURN_DURATION_S = 0.55
const RECOVERY_DURATION_S = 0.2
const RECOVERY_EASE = 'power2.out'
const NEUTRAL_SCALE = 1

function tipOffset(stage: HTMLElement, antenna: HTMLElement): EmitterAnchor {
  const stageBounds = stage.getBoundingClientRect()
  const antennaBounds = antenna.getBoundingClientRect()
  return {
    x: antennaBounds.left - stageBounds.left + antennaBounds.width * TIP_FRACTION_X,
    y: antennaBounds.top - stageBounds.top + antennaBounds.height * TIP_FRACTION_Y,
  }
}

const throbIn = (): gsap.TweenVars => ({
  scaleY: THROB_SCALE_Y,
  scaleX: THROB_SCALE_X,
  duration: THROB_RISE_DURATION_S,
  ease: THROB_RISE_EASE,
})

const throbOut = (): gsap.TweenVars => ({
  scaleY: NEUTRAL_SCALE,
  scaleX: NEUTRAL_SCALE,
  duration: THROB_RETURN_DURATION_S,
  ease: THROB_EASE,
})

function buildWorkTimeline(antenna: HTMLElement, eyes: HTMLElement, eyeRestScaleY: number): gsap.core.Timeline {
  return gsap
    .timeline({repeat: -1})
    .to(antenna, throbIn(), THROB_BEATS[0])
    .to(antenna, throbOut(), THROB_BEATS[1])
    .to(antenna, throbIn(), THROB_BEATS[2])
    .to(antenna, throbOut(), THROB_BEATS[3])
    .to(eyes, {scaleY: BLINK_CLOSE_SCALE_Y, duration: BLINK_CLOSE_DURATION_S, ease: BLINK_CLOSE_EASE}, BLINK_BEATS[0])
    .to(eyes, {scaleY: eyeRestScaleY, duration: BLINK_OPEN_DURATION_S, ease: BLINK_OPEN_EASE}, BLINK_BEATS[1])
}

export function createActivityController(parts: ActivityParts): ActivityController {
  const {stage, antenna, eyes} = parts
  let timeline: gsap.core.Timeline | undefined
  let emitter: BinaryEmitter | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let restingEyeScaleY = NEUTRAL_SCALE

  const killTimeline = () => {
    timeline?.kill()
    timeline = undefined
  }

  const killRecoveryTweens = () => {
    recoveryTweens.forEach((tween) => tween.kill())
    recoveryTweens = []
  }

  const startEmitter = () => {
    if (emitter === undefined) emitter = createBinaryEmitter(stage, tipOffset(stage, antenna))
    emitter.start()
  }

  const start = (eyeRestScaleY: number) => {
    if (reduceMotion()) return
    restingEyeScaleY = eyeRestScaleY
    killTimeline()
    killRecoveryTweens()
    timeline = buildWorkTimeline(antenna, eyes, eyeRestScaleY)
    startEmitter()
  }

  const recover = () => {
    recoveryTweens = [
      gsap.to(antenna, {
        scaleX: NEUTRAL_SCALE,
        scaleY: NEUTRAL_SCALE,
        duration: RECOVERY_DURATION_S,
        ease: RECOVERY_EASE,
      }),
      gsap.to(eyes, {scaleY: restingEyeScaleY, duration: RECOVERY_DURATION_S, ease: RECOVERY_EASE}),
    ]
  }

  const clearEmitter = () => {
    emitter = undefined
  }

  const stop = () => {
    if (timeline === undefined && emitter === undefined) return
    killTimeline()
    killRecoveryTweens()
    recover()
    emitter?.stop(clearEmitter)
  }

  const dispose = () => {
    killTimeline()
    killRecoveryTweens()
    emitter?.remove()
    emitter = undefined
  }

  return {start, stop, dispose}
}
