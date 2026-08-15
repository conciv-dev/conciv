import gsap from 'gsap'
import {
  BLINK_BEATS,
  BLINK_CLOSE_DURATION_S,
  BLINK_CLOSE_EASE,
  BLINK_CLOSE_SCALE_Y,
  BLINK_OPEN_DURATION_S,
  BLINK_OPEN_EASE,
  RECOVERY_DURATION_S,
  RECOVERY_EASE,
  reduceMotion,
  THROB_BEATS,
  THROB_RETURN_DURATION_S,
  THROB_RETURN_EASE,
  THROB_RISE_DURATION_S,
  THROB_RISE_EASE,
  THROB_SCALE_X,
  THROB_SCALE_Y,
  TIP_TRACK_DURATION_S,
} from '../config.js'
import {createBinaryEmitter, type BinaryEmitter} from '../effects/binary.js'
import {antennaTipAnchor} from '../tip-anchor.js'

export type ActivityParts = {stage: HTMLElement; antenna: HTMLElement; eyes: HTMLElement}

export type ActivityController = {
  start: (eyeRestScaleY: number) => void
  setEyeRest: (eyeRestScaleY: number) => void
  trackTip: () => void
  stop: () => void
  dispose: () => void
}

const NEUTRAL_SCALE = 1

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
  ease: THROB_RETURN_EASE,
})

type WorkTimeline = {timeline: gsap.core.Timeline; blinkReturn: gsap.core.Tween}

function buildWorkTimeline(antenna: HTMLElement, eyes: HTMLElement, eyeRestScaleY: number): WorkTimeline {
  const blinkReturn = gsap.to(eyes, {
    scaleY: eyeRestScaleY,
    duration: BLINK_OPEN_DURATION_S,
    ease: BLINK_OPEN_EASE,
  })
  const timeline = gsap
    .timeline({repeat: -1})
    .to(antenna, throbIn(), THROB_BEATS[0])
    .to(antenna, throbOut(), THROB_BEATS[1])
    .to(antenna, throbIn(), THROB_BEATS[2])
    .to(antenna, throbOut(), THROB_BEATS[3])
    .to(eyes, {scaleY: BLINK_CLOSE_SCALE_Y, duration: BLINK_CLOSE_DURATION_S, ease: BLINK_CLOSE_EASE}, BLINK_BEATS[0])
    .add(blinkReturn, BLINK_BEATS[1])
  return {timeline, blinkReturn}
}

export function createActivityController(parts: ActivityParts): ActivityController {
  const {stage, antenna, eyes} = parts
  let work: WorkTimeline | undefined
  let emitter: BinaryEmitter | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let tipTracker: gsap.core.Tween | undefined
  let restingEyeScaleY = NEUTRAL_SCALE

  const killTimeline = () => {
    work?.timeline.kill()
    work = undefined
  }

  const killRecoveryTweens = () => {
    recoveryTweens.forEach((tween) => tween.kill())
    recoveryTweens = []
  }

  const killTipTracker = () => {
    tipTracker?.kill()
    tipTracker = undefined
  }

  const anchorEmitter = () => {
    if (emitter === undefined) return
    const tip = antennaTipAnchor(stage, antenna)
    gsap.set(emitter.element, {left: tip.x, top: tip.y, autoRound: false})
  }

  const trackTip = () => {
    if (emitter === undefined) return
    killTipTracker()
    tipTracker = gsap.to({}, {duration: TIP_TRACK_DURATION_S, onUpdate: anchorEmitter, onComplete: anchorEmitter})
  }

  const startEmitter = () => {
    if (emitter === undefined) emitter = createBinaryEmitter(stage, antenna, antennaTipAnchor(stage, antenna))
    emitter.start()
  }

  const setEyeRest = (eyeRestScaleY: number) => {
    restingEyeScaleY = eyeRestScaleY
    if (work === undefined) return
    work.blinkReturn.vars.scaleY = eyeRestScaleY
    work.blinkReturn.invalidate()
  }

  const start = (eyeRestScaleY: number) => {
    if (reduceMotion()) return
    restingEyeScaleY = eyeRestScaleY
    killTimeline()
    killRecoveryTweens()
    work = buildWorkTimeline(antenna, eyes, eyeRestScaleY)
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
    if (work === undefined && emitter === undefined) return
    killTimeline()
    killRecoveryTweens()
    killTipTracker()
    recover()
    emitter?.stop(clearEmitter)
  }

  const dispose = () => {
    killTimeline()
    killRecoveryTweens()
    killTipTracker()
    emitter?.remove()
    emitter = undefined
  }

  return {start, setEyeRest, trackTip, stop, dispose}
}
