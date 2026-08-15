import {
  anyFollowChannel,
  type FollowChannels,
  followChannels,
  type MascotConfig,
  NO_FOLLOW_CHANNELS,
  reduceMotion,
  sameFollowChannels,
} from './config.js'
import type {EffectMount} from './effects/effect.js'
import {antennaStyle, effectHostStyle, eyesStyle, headStyle, rootStyle} from './layer-styles.js'
import {
  type ActivityController,
  type ActivityRecovery,
  type ActivityRest,
  createActivityController,
} from './parts/activity.js'
import {createFollowController, type FollowController, wrapForLean} from './parts/follow.js'
import {createPoseController, type PoseController} from './parts/pose.js'
import {type MascotSkin, robotSkin} from './skin.js'

export type MascotParts = {
  stage: HTMLElement
  head: HTMLElement
  eyes: HTMLElement
  antenna: HTMLElement
}

export type MascotPartRef = (element: HTMLElement | null) => void

export type MascotPartProps = {style: Record<string, string>; ref: MascotPartRef}

export type MascotConnect = {
  getRootProps: () => MascotPartProps
  getHeadProps: () => MascotPartProps
  getEyesProps: () => MascotPartProps
  getAntennaProps: () => MascotPartProps
  getEffectHostProps: (id: string) => MascotPartProps
}

export type MascotService = {
  update: (config: MascotConfig) => void
  registerParts: (parts: MascotParts) => void
  mountEffect: (id: string, mount: EffectMount) => void
  unmountEffect: (id: string) => void
  connect: () => MascotConnect
  destroy: () => void
}

type Registration = {
  parts: MascotParts
  leanWrapper: HTMLElement | undefined
  pose: PoseController
  follow: FollowController
  activity: ActivityController
}

type Slots = {
  root: HTMLElement | undefined
  head: HTMLElement | undefined
  eyes: HTMLElement | undefined
  antenna: HTMLElement | undefined
}

function followTarget(config: MascotConfig): FollowChannels {
  if (config.working || reduceMotion()) return NO_FOLLOW_CHANNELS
  return followChannels(config.follow)
}

function samePartsAs(registration: Registration, parts: MascotParts): boolean {
  const current = registration.parts
  if (current.stage !== parts.stage || current.head !== parts.head) return false
  return current.eyes === parts.eyes && current.antenna === parts.antenna
}

function readyParts(slots: Slots): MascotParts | undefined {
  const {root, head, eyes, antenna} = slots
  if (root === undefined || head === undefined) return undefined
  if (eyes === undefined || antenna === undefined) return undefined
  return {stage: root, head, eyes, antenna}
}

const poseRest = (registration: Registration): ActivityRest => ({
  eyeScaleY: registration.pose.eyeRestScaleY(),
  headYPercent: registration.pose.headRestYPercent(),
})

function applyPose(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  if (previous.state === next.state) return
  if (reduceMotion()) return registration.pose.set(next.state)
  registration.pose.animateTo(next.state)
}

function applyFollow(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  const wanted = followTarget(next)
  if (sameFollowChannels(wanted, followTarget(previous))) return
  if (anyFollowChannel(wanted)) return registration.follow.arm(wanted)
  registration.follow.disarm(!next.working)
}

function startWorking(registration: Registration): void {
  registration.follow.disarm(false)
  registration.activity.start(poseRest(registration))
  registration.activity.trackTip()
}

function applyWork(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  if (!previous.working) return startWorking(registration)
  if (previous.state === next.state) return
  registration.activity.setRest(poseRest(registration))
  registration.activity.trackTip()
}

function recoveryFor(previous: MascotConfig, next: MascotConfig): ActivityRecovery {
  if (previous.state === next.state) return {pose: true, antennaScale: true}
  return {pose: false, antennaScale: next.state === 'awake'}
}

function endWork(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  registration.activity.stop(recoveryFor(previous, next))
  applyPose(registration, previous, next)
  const wanted = followTarget(next)
  if (anyFollowChannel(wanted)) registration.follow.arm(wanted)
}

function applyTransition(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  if (previous.working && !next.working) return endWork(registration, previous, next)
  applyPose(registration, previous, next)
  if (next.working) return applyWork(registration, previous, next)
  applyFollow(registration, previous, next)
}

export function createMascot(initial: MascotConfig, skin: MascotSkin = robotSkin): MascotService {
  const slots: Slots = {root: undefined, head: undefined, eyes: undefined, antenna: undefined}
  const effectMounts = new Map<string, EffectMount>()
  const effectHosts = new Map<string, HTMLElement>()
  const effectHostRefs = new Map<string, MascotPartRef>()
  let config = initial
  let registration: Registration | undefined
  let destroyed = false

  const teardown = () => {
    if (registration === undefined) return
    registration.activity.dispose()
    registration.follow.dispose()
    registration.pose.dispose()
    registration.leanWrapper?.replaceWith(registration.parts.antenna)
    registration = undefined
  }

  const setup = (parts: MascotParts) => {
    const leanWrapper = wrapForLean(parts.antenna, skin)
    const pose = createPoseController(parts, skin)
    const follow = createFollowController({eyes: parts.eyes, leanWrapper})
    const activity = createActivityController(
      {stage: parts.stage, head: parts.head, antenna: parts.antenna, eyes: parts.eyes},
      skin,
    )
    registration = {parts, leanWrapper, pose, follow, activity}
    pose.set(config.state)
    effectMounts.forEach((mount, id) => activity.mountEffect(id, mount, effectHosts.get(id)))
    if (config.working) startWorking(registration)
    follow.arm(followTarget(config))
  }

  const registerParts = (parts: MascotParts) => {
    if (destroyed) return
    if (registration !== undefined && samePartsAs(registration, parts)) return
    teardown()
    setup(parts)
  }

  const update = (next: MascotConfig) => {
    if (destroyed) return
    const previous = config
    config = next
    if (registration === undefined) return
    applyTransition(registration, previous, next)
  }

  const mountEffect = (id: string, mount: EffectMount) => {
    if (destroyed) return
    effectMounts.set(id, mount)
    registration?.activity.mountEffect(id, mount, effectHosts.get(id))
  }

  const unmountEffect = (id: string) => {
    if (destroyed) return
    effectMounts.delete(id)
    registration?.activity.unmountEffect(id)
  }

  const syncSlots = () => {
    if (destroyed) return
    const parts = readyParts(slots)
    if (parts === undefined) return teardown()
    registerParts(parts)
  }

  const slotRef =
    (slot: keyof Slots): MascotPartRef =>
    (element) => {
      slots[slot] = element ?? undefined
      syncSlots()
    }

  const rootRef = slotRef('root')
  const headRef = slotRef('head')
  const eyesRef = slotRef('eyes')
  const antennaRef = slotRef('antenna')

  const bindEffectHost = (id: string, element: HTMLElement | null) => {
    if (element === null) effectHosts.delete(id)
    if (element !== null) effectHosts.set(id, element)
    registration?.activity.setEffectHost(id, element ?? undefined)
  }

  const effectHostRef = (id: string): MascotPartRef => {
    const existing = effectHostRefs.get(id)
    if (existing !== undefined) return existing
    const ref: MascotPartRef = (element) => bindEffectHost(id, element)
    effectHostRefs.set(id, ref)
    return ref
  }

  const connect = (): MascotConnect => ({
    getRootProps: () => ({style: rootStyle(), ref: rootRef}),
    getHeadProps: () => ({style: headStyle(skin), ref: headRef}),
    getEyesProps: () => ({style: eyesStyle(skin), ref: eyesRef}),
    getAntennaProps: () => ({style: antennaStyle(skin), ref: antennaRef}),
    getEffectHostProps: (id) => ({style: effectHostStyle(), ref: effectHostRef(id)}),
  })

  const destroy = () => {
    teardown()
    destroyed = true
  }

  return {update, registerParts, mountEffect, unmountEffect, connect, destroy}
}
