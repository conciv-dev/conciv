import gsap from 'gsap'
import {
  type ActivityChannels,
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
  start: (rest: ActivityRest, channels: ActivityChannels) => void
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

type BobTweens = {down: gsap.core.Tween; back: gsap.core.Tween}

type RecoveryStep = {wanted: boolean; make: () => gsap.core.Tween}

type WorkTimeline = {
  timeline: gsap.core.Timeline
  blinkReturn: gsap.core.Tween | undefined
  bob: BobTweens | undefined
}

type WorkSession = WorkTimeline & {layout: AntennaLayout | undefined; channels: ActivityChannels}

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

function buildBob(parts: ActivityParts, rest: ActivityRest): BobTweens {
  const bobbed = [parts.head, parts.antenna, parts.eyes]
  const down = gsap.fromTo(
    bobbed,
    {yPercent: rest.headYPercent},
    {
      yPercent: HEAD_BOB_Y_PERCENT,
      duration: HEAD_BOB_DURATION_S,
      ease: HEAD_BOB_EASE,
      immediateRender: false,
    },
  )
  const back = gsap.to(bobbed, {
    yPercent: rest.headYPercent,
    duration: HEAD_BOB_DURATION_S,
    ease: HEAD_BOB_EASE,
  })
  return {down, back}
}

const buildBlinkReturn = (eyes: HTMLElement, rest: ActivityRest): gsap.core.Tween =>
  gsap.to(eyes, {scaleY: rest.eyeScaleY, duration: BLINK_OPEN_DURATION_S, ease: BLINK_OPEN_EASE})

function addBob(timeline: gsap.core.Timeline, bob: BobTweens | undefined): void {
  if (bob === undefined) return
  timeline.add(bob.down, HEAD_BOB_BEATS[0]).add(bob.back, HEAD_BOB_BEATS[1])
}

function addThrob(timeline: gsap.core.Timeline, antenna: HTMLElement, wanted: boolean): void {
  if (!wanted) return
  timeline
    .to(antenna, throbIn(), THROB_BEATS[0])
    .to(antenna, throbOut(), THROB_BEATS[1])
    .to(antenna, throbIn(), THROB_BEATS[2])
    .to(antenna, throbOut(), THROB_BEATS[3])
}

function addBlink(timeline: gsap.core.Timeline, eyes: HTMLElement, blinkReturn: gsap.core.Tween | undefined): void {
  if (blinkReturn === undefined) return
  timeline
    .to(eyes, {scaleY: BLINK_CLOSE_SCALE_Y, duration: BLINK_CLOSE_DURATION_S, ease: BLINK_CLOSE_EASE}, BLINK_BEATS[0])
    .add(blinkReturn, BLINK_BEATS[1])
}

function buildWorkTimeline(
  parts: ActivityParts,
  rest: ActivityRest,
  channels: ActivityChannels,
  onUpdate: () => void,
): WorkTimeline {
  const bob = channels.bob ? buildBob(parts, rest) : undefined
  const blinkReturn = channels.blink ? buildBlinkReturn(parts.eyes, rest) : undefined
  const timeline = gsap.timeline({repeat: -1, onUpdate})
  addBob(timeline, bob)
  addThrob(timeline, parts.antenna, channels.throb)
  addBlink(timeline, parts.eyes, blinkReturn)
  return {timeline, blinkReturn, bob}
}

function retarget(tween: gsap.core.Tween | undefined, property: string, value: number): void {
  if (tween === undefined) return
  tween.vars[property] = value
  tween.invalidate()
}

function rebase(tween: gsap.core.Tween | undefined, property: string, value: number): void {
  if (tween === undefined) return
  tween.vars.startAt = {...tween.vars.startAt, [property]: value}
  tween.invalidate()
}

export function createActivityController(parts: ActivityParts, skin: MascotSkin): ActivityController {
  const {stage, head, antenna, eyes} = parts
  const effects = new Map<string, EffectEntry>()
  const draining = new Set<EffectHandle>()
  let session: WorkSession | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let resizeTick: gsap.Callback | undefined
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

  const launchEntry = (entry: EffectEntry, host: HTMLElement) => {
    entry.handle = entry.handle ?? entry.mount({host, stage, antenna, skin})
    draining.delete(entry.handle)
    anchorEntry(entry)
    entry.handle.start()
  }

  const startEntry = (entry: EffectEntry) => {
    const host = entry.host ?? stage
    entry.hostOrigin = hostOriginInRoot(host)
    try {
      launchEntry(entry, host)
    } catch {
      removeEntry(entry)
    }
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

  const restartEntry = (entry: EffectEntry) => {
    forgetLayout()
    startEntry(entry)
  }

  const restartEntries = () => {
    forgetLayout()
    effects.forEach(startEntry)
  }

  const remeasure = () => {
    resizeTick = undefined
    forgetLayout()
    effects.forEach(removeEntry)
    if (!isRunning()) return
    effects.forEach(startEntry)
  }

  const scheduleRemeasure = () => {
    if (resizeTick !== undefined) return
    resizeTick = gsap.ticker.add(remeasure, true)
  }

  const cancelRemeasure = () => {
    if (resizeTick !== undefined) gsap.ticker.remove(resizeTick)
    resizeTick = undefined
  }

  window.addEventListener('resize', scheduleRemeasure, {passive: true})

  const setRest = (rest: ActivityRest) => {
    resting = rest
    if (session === undefined) return
    retarget(session.blinkReturn, 'scaleY', rest.eyeScaleY)
    retarget(session.bob?.back, 'yPercent', rest.headYPercent)
    rebase(session.bob?.down, 'yPercent', rest.headYPercent)
  }

  const start = (rest: ActivityRest, channels: ActivityChannels) => {
    if (reduceMotion()) return
    resting = rest
    killTimeline()
    killRecoveryTweens()
    const started: WorkSession = {
      ...buildWorkTimeline(parts, rest, channels, anchorEffects),
      layout: undefined,
      channels,
    }
    session = started
    if (!visible) return started.timeline.pause()
    restartEntries()
  }

  const suspend = (current: WorkSession) => {
    current.timeline.pause()
    effects.forEach(parkEntry)
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  const resume = (current: WorkSession) => {
    current.timeline.play()
    restartEntries()
  }

  const setVisible = (next: boolean) => {
    if (visible === next) return
    visible = next
    const current = session
    if (current === undefined) return
    if (next) return resume(current)
    suspend(current)
  }

  const recoverAntennaScale = (): gsap.core.Tween =>
    gsap.to(antenna, {
      scaleX: NEUTRAL_SCALE,
      scaleY: NEUTRAL_SCALE,
      duration: RECOVERY_DURATION_S,
      ease: RECOVERY_EASE,
    })

  const recoverEyeScale = (): gsap.core.Tween =>
    gsap.to(eyes, {scaleY: resting.eyeScaleY, duration: RECOVERY_DURATION_S, ease: RECOVERY_EASE})

  const recoverBobHeight = (): gsap.core.Tween =>
    gsap.to([head, antenna, eyes], {
      yPercent: resting.headYPercent,
      duration: RECOVERY_DURATION_S,
      ease: RECOVERY_EASE,
    })

  const recover = (recovery: ActivityRecovery, channels: ActivityChannels) => {
    const steps: RecoveryStep[] = [
      {wanted: recovery.antennaScale && channels.throb, make: recoverAntennaScale},
      {wanted: recovery.pose && channels.blink, make: recoverEyeScale},
      {wanted: recovery.pose && channels.bob, make: recoverBobHeight},
    ]
    recoveryTweens = steps.filter((step) => step.wanted).map((step) => step.make())
  }

  const stop = (recovery: ActivityRecovery) => {
    const current = session
    if (current === undefined) return
    killTimeline()
    killRecoveryTweens()
    recover(recovery, current.channels)
    effects.forEach(stopEntry)
  }

  const mountEffect = (id: string, mount: EffectMount, host: HTMLElement | undefined) => {
    const existing = effects.get(id)
    if (existing !== undefined) removeEntry(existing)
    const entry: EffectEntry = {mount, host, handle: undefined, hostOrigin: undefined}
    effects.set(id, entry)
    if (isRunning()) restartEntry(entry)
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
    if (isRunning()) restartEntry(entry)
  }

  const dispose = () => {
    window.removeEventListener('resize', scheduleRemeasure)
    cancelRemeasure()
    killTimeline()
    killRecoveryTweens()
    effects.forEach(removeEntry)
    effects.clear()
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  return {start, setRest, setVisible, stop, mountEffect, unmountEffect, setEffectHost, dispose}
}
