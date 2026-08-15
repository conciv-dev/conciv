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
} from '../config.js'
import type {EffectHandle, EffectMount} from '../effects/effect.js'
import type {EmitterAnchor} from '../path.js'
import type {MascotSkin} from '../skin.js'
import {type AntennaLayout, antennaTipOf, hostOriginInRoot, measureAntennaLayout} from '../tip-anchor.js'

export type ActivityParts = {stage: HTMLElement; head: HTMLElement; antenna: HTMLElement; eyes: HTMLElement}

export type ActivityRest = {eyeScaleY: number; headYPercent: number}

export type ActivityRecovery = {pose: boolean; antennaScale: boolean}

export type ActivityController = {
  start: (rest: ActivityRest) => void
  setRest: (rest: ActivityRest) => void
  setVisible: (visible: boolean) => void
  stop: (recovery: ActivityRecovery) => void
  mountEffect: (id: string, mount: EffectMount, host: HTMLElement | undefined) => void
  unmountEffect: (id: string) => void
  setEffectHost: (id: string, host: HTMLElement | undefined) => void
  dispose: () => void
}

type EffectEntry = {
  mount: EffectMount
  host: HTMLElement | undefined
  handle: EffectHandle | undefined
  hostOrigin: EmitterAnchor | undefined
}

type WorkTimeline = {
  timeline: gsap.core.Timeline
  blinkReturn: gsap.core.Tween
  bobDown: gsap.core.Tween
  bobReturn: gsap.core.Tween
}

type WorkSession = WorkTimeline & {layout: AntennaLayout | undefined}

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

function buildWorkTimeline(parts: ActivityParts, rest: ActivityRest, onUpdate: () => void): WorkTimeline {
  const {head, antenna, eyes} = parts
  const bobbed = [head, antenna, eyes]
  const blinkReturn = gsap.to(eyes, {
    scaleY: rest.eyeScaleY,
    duration: BLINK_OPEN_DURATION_S,
    ease: BLINK_OPEN_EASE,
  })
  const bobDown = gsap.fromTo(
    bobbed,
    {yPercent: rest.headYPercent},
    {
      yPercent: HEAD_BOB_Y_PERCENT,
      duration: HEAD_BOB_DURATION_S,
      ease: HEAD_BOB_EASE,
      immediateRender: false,
    },
  )
  const bobReturn = gsap.to(bobbed, {
    yPercent: rest.headYPercent,
    duration: HEAD_BOB_DURATION_S,
    ease: HEAD_BOB_EASE,
  })
  const timeline = gsap
    .timeline({repeat: -1, onUpdate})
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
  let session: WorkSession | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let resting: ActivityRest = {eyeScaleY: NEUTRAL_SCALE, headYPercent: 0}
  let visible = true

  const isRunning = () => session !== undefined && visible

  const killTimeline = () => {
    session?.timeline.kill()
    session = undefined
  }

  const killRecoveryTweens = () => {
    recoveryTweens.forEach((tween) => tween.kill())
    recoveryTweens = []
  }

  const sessionTip = (current: WorkSession): EmitterAnchor => {
    const layout = current.layout ?? measureAntennaLayout(antenna, skin)
    current.layout = layout
    return antennaTipOf(antenna, layout)
  }

  const tipWithinHostOf = (entry: EffectEntry, tip: EmitterAnchor): EmitterAnchor => {
    const origin = entry.hostOrigin ?? hostOriginInRoot(entry.host ?? stage)
    entry.hostOrigin = origin
    return {x: tip.x - origin.x, y: tip.y - origin.y}
  }

  const anchorEffects = () => {
    const current = session
    if (current === undefined) return
    let tip: EmitterAnchor | undefined
    effects.forEach((entry) => {
      const anchor = entry.handle?.anchor
      if (anchor === undefined) return
      tip = tip ?? sessionTip(current)
      anchor(tipWithinHostOf(entry, tip))
    })
  }

  const anchorEntry = (entry: EffectEntry) => {
    const current = session
    const anchor = entry.handle?.anchor
    if (current === undefined || anchor === undefined) return
    anchor(tipWithinHostOf(entry, sessionTip(current)))
  }

  const forgetLayout = () => {
    if (session !== undefined) session.layout = undefined
    effects.forEach((entry) => {
      entry.hostOrigin = undefined
    })
  }

  window.addEventListener('resize', forgetLayout, {passive: true})

  const startEntry = (entry: EffectEntry) => {
    const host = entry.host ?? stage
    forgetLayout()
    entry.hostOrigin = hostOriginInRoot(host)
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
      if (entry.handle !== handle) handle.remove()
    })
  }

  const parkEntry = (entry: EffectEntry) => {
    const handle = entry.handle
    if (handle === undefined) return
    draining.delete(handle)
    handle.rest()
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
    if (session === undefined) return
    retarget(session.blinkReturn, 'scaleY', rest.eyeScaleY)
    retarget(session.bobReturn, 'yPercent', rest.headYPercent)
    rebase(session.bobDown, 'yPercent', rest.headYPercent)
  }

  const start = (rest: ActivityRest) => {
    if (reduceMotion()) return
    resting = rest
    killTimeline()
    killRecoveryTweens()
    const started: WorkSession = {...buildWorkTimeline(parts, rest, anchorEffects), layout: undefined}
    session = started
    if (!visible) return started.timeline.pause()
    effects.forEach(startEntry)
  }

  const suspend = (current: WorkSession) => {
    current.timeline.pause()
    effects.forEach(parkEntry)
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  const resume = (current: WorkSession) => {
    current.timeline.play()
    effects.forEach(startEntry)
  }

  const setVisible = (next: boolean) => {
    if (visible === next) return
    visible = next
    const current = session
    if (current === undefined) return
    if (next) return resume(current)
    suspend(current)
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
      gsap.to([head, antenna, eyes], {
        yPercent: resting.headYPercent,
        duration: RECOVERY_DURATION_S,
        ease: RECOVERY_EASE,
      }),
    )
  }

  const stop = (recovery: ActivityRecovery) => {
    if (session === undefined) return
    killTimeline()
    killRecoveryTweens()
    recover(recovery)
    effects.forEach(stopEntry)
  }

  const mountEffect = (id: string, mount: EffectMount, host: HTMLElement | undefined) => {
    const existing = effects.get(id)
    if (existing !== undefined) removeEntry(existing)
    const entry: EffectEntry = {mount, host, handle: undefined, hostOrigin: undefined}
    effects.set(id, entry)
    if (isRunning()) startEntry(entry)
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
    entry.hostOrigin = undefined
    if (isRunning()) startEntry(entry)
  }

  const dispose = () => {
    window.removeEventListener('resize', forgetLayout)
    killTimeline()
    killRecoveryTweens()
    effects.forEach(removeEntry)
    effects.clear()
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  return {start, setRest, setVisible, stop, mountEffect, unmountEffect, setEffectHost, dispose}
}
