import gsap from 'gsap'
import {
  BLINK_BEATS,
  BLINK_CLOSE_DURATION_S,
  BLINK_CLOSE_EASE,
  BLINK_CLOSE_SCALE_Y,
  BLINK_OPEN_DURATION_S,
  BLINK_OPEN_EASE,
  HEAD_BOB_BEATS,
  HEAD_BOB_DURATION_S,
  HEAD_BOB_EASE,
  HEAD_BOB_Y_PERCENT,
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
import type {EffectHandle, EffectMount} from '../effects/effect.js'
import type {MascotSkin} from '../skin.js'
import {antennaTipAnchor} from '../tip-anchor.js'

export type ActivityParts = {stage: HTMLElement; head: HTMLElement; antenna: HTMLElement; eyes: HTMLElement}

export type ActivityRest = {eyeScaleY: number; headYPercent: number}

export type ActivityRecovery = {pose: boolean; antennaScale: boolean}

export type ActivityController = {
  start: (rest: ActivityRest) => void
  setRest: (rest: ActivityRest) => void
  trackTip: () => void
  stop: (recovery: ActivityRecovery) => void
  mountEffect: (id: string, mount: EffectMount, host: HTMLElement | undefined) => void
  unmountEffect: (id: string) => void
  setEffectHost: (id: string, host: HTMLElement | undefined) => void
  dispose: () => void
}

type EffectEntry = {mount: EffectMount; host: HTMLElement | undefined; handle: EffectHandle | undefined}

type WorkTimeline = {
  timeline: gsap.core.Timeline
  blinkReturn: gsap.core.Tween
  bobDown: gsap.core.Tween
  bobReturn: gsap.core.Tween
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

function buildWorkTimeline(parts: ActivityParts, rest: ActivityRest): WorkTimeline {
  const {head, antenna, eyes} = parts
  const blinkReturn = gsap.to(eyes, {
    scaleY: rest.eyeScaleY,
    duration: BLINK_OPEN_DURATION_S,
    ease: BLINK_OPEN_EASE,
  })
  const bobDown = gsap.fromTo(
    head,
    {yPercent: rest.headYPercent},
    {
      yPercent: HEAD_BOB_Y_PERCENT,
      duration: HEAD_BOB_DURATION_S,
      ease: HEAD_BOB_EASE,
      immediateRender: false,
    },
  )
  const bobReturn = gsap.to(head, {
    yPercent: rest.headYPercent,
    duration: HEAD_BOB_DURATION_S,
    ease: HEAD_BOB_EASE,
  })
  const timeline = gsap
    .timeline({repeat: -1})
    .add(bobDown, HEAD_BOB_BEATS[0])
    .add(bobReturn, HEAD_BOB_BEATS[1])
    .to(antenna, throbIn(), THROB_BEATS[0])
    .to(antenna, throbOut(), THROB_BEATS[1])
    .to(antenna, throbIn(), THROB_BEATS[2])
    .to(antenna, throbOut(), THROB_BEATS[3])
    .to(eyes, {scaleY: BLINK_CLOSE_SCALE_Y, duration: BLINK_CLOSE_DURATION_S, ease: BLINK_CLOSE_EASE}, BLINK_BEATS[0])
    .add(blinkReturn, BLINK_BEATS[1])
  return {timeline, blinkReturn, bobDown, bobReturn}
}

function retarget(tween: gsap.core.Tween, property: string, value: number): void {
  tween.vars[property] = value
  tween.invalidate()
}

function rebase(tween: gsap.core.Tween, property: string, value: number): void {
  tween.vars.startAt = {...tween.vars.startAt, [property]: value}
  tween.invalidate()
}

export function createActivityController(parts: ActivityParts, skin: MascotSkin): ActivityController {
  const {stage, head, antenna, eyes} = parts
  const effects = new Map<string, EffectEntry>()
  const draining = new Set<EffectHandle>()
  let work: WorkTimeline | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let tipTracker: gsap.core.Tween | undefined
  let resting: ActivityRest = {eyeScaleY: NEUTRAL_SCALE, headYPercent: 0}

  const isWorking = () => work !== undefined

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

  const anchorEntry = (entry: EffectEntry) => {
    if (entry.handle?.anchor === undefined) return
    entry.handle.anchor(antennaTipAnchor(entry.host ?? stage, antenna, skin))
  }

  const anchorEffects = () => effects.forEach(anchorEntry)

  const trackTip = () => {
    if (work === undefined || effects.size === 0) return
    killTipTracker()
    tipTracker = gsap.to({}, {duration: TIP_TRACK_DURATION_S, onUpdate: anchorEffects, onComplete: anchorEffects})
  }

  const startEntry = (entry: EffectEntry) => {
    const host = entry.host ?? stage
    entry.handle = entry.handle ?? entry.mount({host, stage, antenna, skin})
    draining.delete(entry.handle)
    anchorEntry(entry)
    entry.handle.start()
  }

  const beginDrain = (entry: EffectEntry, handle: EffectHandle) => {
    if (draining.has(handle)) return
    draining.add(handle)
    handle.stop(() => {
      draining.delete(handle)
      if (entry.handle === handle) entry.handle = undefined
    })
  }

  const stopEntry = (entry: EffectEntry) => {
    if (entry.handle === undefined) return
    beginDrain(entry, entry.handle)
  }

  const detachAndDrain = (entry: EffectEntry) => {
    const handle = entry.handle
    entry.handle = undefined
    if (handle === undefined) return
    beginDrain(entry, handle)
  }

  const removeEntry = (entry: EffectEntry) => {
    const handle = entry.handle
    entry.handle = undefined
    if (handle === undefined) return
    draining.delete(handle)
    handle.remove()
  }

  const setRest = (rest: ActivityRest) => {
    resting = rest
    if (work === undefined) return
    retarget(work.blinkReturn, 'scaleY', rest.eyeScaleY)
    retarget(work.bobReturn, 'yPercent', rest.headYPercent)
    rebase(work.bobDown, 'yPercent', rest.headYPercent)
  }

  const start = (rest: ActivityRest) => {
    if (reduceMotion()) return
    resting = rest
    killTimeline()
    killRecoveryTweens()
    work = buildWorkTimeline(parts, rest)
    effects.forEach(startEntry)
  }

  const recover = (recovery: ActivityRecovery) => {
    recoveryTweens = []
    if (recovery.antennaScale) {
      recoveryTweens.push(
        gsap.to(antenna, {
          scaleX: NEUTRAL_SCALE,
          scaleY: NEUTRAL_SCALE,
          duration: RECOVERY_DURATION_S,
          ease: RECOVERY_EASE,
        }),
      )
    }
    if (!recovery.pose) return
    recoveryTweens.push(
      gsap.to(eyes, {scaleY: resting.eyeScaleY, duration: RECOVERY_DURATION_S, ease: RECOVERY_EASE}),
      gsap.to(head, {yPercent: resting.headYPercent, duration: RECOVERY_DURATION_S, ease: RECOVERY_EASE}),
    )
  }

  const stop = (recovery: ActivityRecovery) => {
    if (work === undefined) return
    killTimeline()
    killRecoveryTweens()
    killTipTracker()
    recover(recovery)
    effects.forEach(stopEntry)
  }

  const mountEffect = (id: string, mount: EffectMount, host: HTMLElement | undefined) => {
    const existing = effects.get(id)
    if (existing !== undefined) removeEntry(existing)
    const entry: EffectEntry = {mount, host, handle: undefined}
    effects.set(id, entry)
    if (isWorking()) startEntry(entry)
  }

  const unmountEffect = (id: string) => {
    const entry = effects.get(id)
    if (entry === undefined) return
    effects.delete(id)
    detachAndDrain(entry)
  }

  const setEffectHost = (id: string, host: HTMLElement | undefined) => {
    const entry = effects.get(id)
    if (entry === undefined || entry.host === host) return
    detachAndDrain(entry)
    entry.host = host
    if (isWorking()) startEntry(entry)
  }

  const dispose = () => {
    killTimeline()
    killRecoveryTweens()
    killTipTracker()
    effects.forEach(removeEntry)
    effects.clear()
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  return {start, setRest, trackTip, stop, mountEffect, unmountEffect, setEffectHost, dispose}
}
