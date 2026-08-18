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
  WORK_CYCLE_S,
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

type WorkPieces = {
  timeline: gsap.core.Timeline
  blinkReturn: gsap.core.Tween | undefined
  bob: BobTweens | undefined
}

type WorkSession = WorkPieces & {channels: ActivityChannels}

const NEUTRAL_SCALE = 1

const CYCLE_PACER = {}

const FULL_RECOVERY: ActivityRecovery = {pose: true, antennaScale: true}

const droppedChannels = (previous: ActivityChannels | undefined, next: ActivityChannels): ActivityChannels => ({
  bob: previous?.bob === true && !next.bob,
  throb: previous?.throb === true && !next.throb,
  blink: previous?.blink === true && !next.blink,
})

const throbIn = (): gsap.TweenVars => ({
  scaleY: THROB_SCALE_Y,
  scaleX: THROB_SCALE_X,
  duration: THROB_RISE_DURATION_S,
  ease: THROB_RISE_EASE,
  force3D: true,
})

const throbOut = (): gsap.TweenVars => ({
  scaleY: NEUTRAL_SCALE,
  scaleX: NEUTRAL_SCALE,
  duration: THROB_RETURN_DURATION_S,
  ease: THROB_RETURN_EASE,
  force3D: true,
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
      force3D: true,
    },
  )
  const back = gsap.to(bobbed, {
    yPercent: rest.headYPercent,
    duration: HEAD_BOB_DURATION_S,
    ease: HEAD_BOB_EASE,
    force3D: true,
  })
  return {down, back}
}

const buildBlinkReturn = (eyes: HTMLElement, rest: ActivityRest): gsap.core.Tween =>
  gsap.to(eyes, {scaleY: rest.eyeScaleY, duration: BLINK_OPEN_DURATION_S, ease: BLINK_OPEN_EASE, force3D: true})

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
    .to(
      eyes,
      {scaleY: BLINK_CLOSE_SCALE_Y, duration: BLINK_CLOSE_DURATION_S, ease: BLINK_CLOSE_EASE, force3D: true},
      BLINK_BEATS[0],
    )
    .add(blinkReturn, BLINK_BEATS[1])
}

function buildWorkPieces(
  parts: ActivityParts,
  rest: ActivityRest,
  channels: ActivityChannels,
  onUpdate: () => void,
): WorkPieces {
  const bob = channels.bob ? buildBob(parts, rest) : undefined
  const blinkReturn = channels.blink ? buildBlinkReturn(parts.eyes, rest) : undefined
  const timeline = gsap.timeline({repeat: -1, onUpdate})
  addBob(timeline, bob)
  addThrob(timeline, parts.antenna, channels.throb)
  addBlink(timeline, parts.eyes, blinkReturn)
  timeline.to(CYCLE_PACER, {duration: WORK_CYCLE_S}, 0)
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

const sameAntennaBox = (baked: AntennaLayout, measured: AntennaLayout): boolean =>
  baked.width === measured.width && baked.height === measured.height

const sameAntennaOrigin = (baked: AntennaLayout, measured: AntennaLayout): boolean =>
  baked.base.x === measured.base.x && baked.base.y === measured.base.y

const sameAntennaGeometry = (baked: AntennaLayout, measured: AntennaLayout): boolean =>
  sameAntennaBox(baked, measured) && sameAntennaOrigin(baked, measured)

export function createActivityController(parts: ActivityParts, skin: MascotSkin): ActivityController {
  const {stage, head, antenna, eyes} = parts
  const effects = new Map<string, EffectEntry>()
  const draining = new Set<EffectHandle>()
  let session: WorkSession | undefined
  let recoveryTweens: gsap.core.Tween[] = []
  let layout: AntennaLayout | undefined
  let resting: ActivityRest = {eyeScaleY: NEUTRAL_SCALE, headYPercent: 0}
  let visible = true

  const isRunning = () => session !== undefined && visible

  const killSession = () => {
    session?.timeline.kill()
    session = undefined
  }

  const killRecoveryTweens = () => {
    recoveryTweens.forEach((tween) => tween.kill())
    recoveryTweens = []
  }

  const antennaLayout = (): AntennaLayout => {
    const measured = layout ?? measureAntennaLayout(antenna, skin)
    layout = measured
    return measured
  }

  const antennaTip = (): EmitterAnchor => antennaTipOf(antenna, antennaLayout())

  const tipWithinHostOf = (entry: EffectEntry, tip: EmitterAnchor): EmitterAnchor => {
    const origin = entry.hostOrigin ?? hostOriginInRoot(entry.host ?? stage)
    entry.hostOrigin = origin
    return {x: tip.x - origin.x, y: tip.y - origin.y}
  }

  const anchorEffects = () => {
    if (session === undefined) return
    let tip: EmitterAnchor | undefined
    effects.forEach((entry) => {
      const anchor = entry.handle?.anchor
      if (anchor === undefined) return
      tip = tip ?? antennaTip()
      anchor(tipWithinHostOf(entry, tip))
    })
  }

  const anchorEntry = (entry: EffectEntry) => {
    const anchor = entry.handle?.anchor
    if (session === undefined || anchor === undefined) return
    anchor(tipWithinHostOf(entry, antennaTip()))
  }

  const bakeLayout = () => {
    layout = measureAntennaLayout(antenna, skin)
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
    bakeLayout()
    startEntry(entry)
  }

  const restartEntries = () => {
    bakeLayout()
    effects.forEach(startEntry)
  }

  const remeasure = () => {
    effects.forEach(removeEntry)
    if (!isRunning()) return
    restartEntries()
  }

  const receiveResize = () => {
    const baked = layout
    if (baked !== undefined && sameAntennaGeometry(baked, measureAntennaLayout(antenna, skin))) return
    remeasure()
  }

  const boxes = new ResizeObserver(receiveResize)
  boxes.observe(antenna)

  const setRest = (rest: ActivityRest) => {
    resting = rest
    if (session === undefined) return
    retarget(session.blinkReturn, 'scaleY', rest.eyeScaleY)
    retarget(session.bob?.back, 'yPercent', rest.headYPercent)
    rebase(session.bob?.down, 'yPercent', rest.headYPercent)
  }

  const start = (rest: ActivityRest, channels: ActivityChannels) => {
    if (reduceMotion()) return
    const dropped = droppedChannels(session?.channels, channels)
    resting = rest
    killSession()
    killRecoveryTweens()
    recover(FULL_RECOVERY, dropped)
    const started: WorkSession = {...buildWorkPieces(parts, rest, channels, anchorEffects), channels}
    session = started
    if (!visible) return started.timeline.pause()
    started.timeline.play()
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
      force3D: true,
    })

  const recoverEyeScale = (): gsap.core.Tween =>
    gsap.to(eyes, {
      scaleY: resting.eyeScaleY,
      duration: RECOVERY_DURATION_S,
      ease: RECOVERY_EASE,
      force3D: true,
    })

  const recoverBobHeight = (): gsap.core.Tween =>
    gsap.to([head, antenna, eyes], {
      yPercent: resting.headYPercent,
      duration: RECOVERY_DURATION_S,
      ease: RECOVERY_EASE,
      force3D: true,
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
    killSession()
    killRecoveryTweens()
    recover(recovery, current.channels)
    effects.forEach(stopEntry)
  }

  const mountEffect = (id: string, mount: EffectMount, host: HTMLElement | undefined) => {
    const existing = effects.get(id)
    if (existing !== undefined) detachAndDrain(existing)
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
    boxes.disconnect()
    killSession()
    killRecoveryTweens()
    effects.forEach(removeEntry)
    effects.clear()
    draining.forEach((handle) => handle.remove())
    draining.clear()
  }

  return {start, setRest, setVisible, stop, mountEffect, unmountEffect, setEffectHost, dispose}
}
