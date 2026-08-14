import {type MascotConfig, reduceMotion} from './config.js'
import {antennaStyle, effectHostStyle, eyesStyle, headStyle, rootStyle} from './layer-styles.js'
import {type ActivityController, createActivityController} from './parts/activity.js'
import {createFollowController, type FollowController, wrapForLean} from './parts/follow.js'
import {createPoseController, type PoseController} from './parts/pose.js'

export type MascotParts = {stage: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

export type MascotPartRef = (element: HTMLElement | null) => void

export type MascotPartProps = {style: Record<string, string>; ref: MascotPartRef}

export type MascotConnect = {
  getRootProps: () => MascotPartProps
  getHeadProps: () => MascotPartProps
  getEyesProps: () => MascotPartProps
  getAntennaProps: () => MascotPartProps
  getEffectHostProps: () => MascotPartProps
}

export type MascotService = {
  update: (config: MascotConfig) => void
  registerParts: (parts: MascotParts) => void
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
  effectHost: HTMLElement | undefined
  head: HTMLElement | undefined
  eyes: HTMLElement | undefined
  antenna: HTMLElement | undefined
}

const followTarget = (config: MascotConfig): boolean => config.follow && !config.working && !reduceMotion()

function samePartsAs(registration: Registration, parts: MascotParts): boolean {
  const current = registration.parts
  if (current.stage !== parts.stage || current.head !== parts.head) return false
  return current.eyes === parts.eyes && current.antenna === parts.antenna
}

function layersOf(slots: Slots, stage: HTMLElement): MascotParts | undefined {
  const {head, eyes, antenna} = slots
  if (head === undefined || eyes === undefined) return undefined
  if (antenna === undefined) return undefined
  return {stage, head, eyes, antenna}
}

function readyParts(slots: Slots): MascotParts | undefined {
  const stage = slots.effectHost ?? slots.root
  if (stage === undefined) return undefined
  return layersOf(slots, stage)
}

function applyPose(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  if (previous.state === next.state) return
  if (reduceMotion()) return registration.pose.set(next.state)
  registration.pose.animateTo(next.state)
}

function applyFollow(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  const wanted = followTarget(next)
  if (wanted === followTarget(previous)) return
  if (wanted) return registration.follow.arm()
  registration.follow.disarm(!next.working)
}

function startWorking(registration: Registration): void {
  registration.follow.disarm(false)
  registration.activity.start(registration.pose.eyeRestScaleY())
}

function stopWorking(registration: Registration, next: MascotConfig): void {
  registration.activity.stop()
  if (followTarget(next)) registration.follow.arm()
}

function applyWorking(registration: Registration, next: MascotConfig): void {
  if (next.working) return startWorking(registration)
  stopWorking(registration, next)
}

function applyTransition(registration: Registration, previous: MascotConfig, next: MascotConfig): void {
  applyPose(registration, previous, next)
  if (previous.working !== next.working) return applyWorking(registration, next)
  applyFollow(registration, previous, next)
}

export function createMascot(initial: MascotConfig): MascotService {
  const slots: Slots = {root: undefined, effectHost: undefined, head: undefined, eyes: undefined, antenna: undefined}
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
    const leanWrapper = wrapForLean(parts.antenna)
    const pose = createPoseController(parts)
    const follow = createFollowController({eyes: parts.eyes, leanWrapper})
    const activity = createActivityController({stage: parts.stage, antenna: parts.antenna, eyes: parts.eyes})
    registration = {parts, leanWrapper, pose, follow, activity}
    pose.set(config.state)
    if (config.working) activity.start(pose.eyeRestScaleY())
    if (followTarget(config)) follow.arm()
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

  const connect = (): MascotConnect => ({
    getRootProps: () => ({style: rootStyle(), ref: slotRef('root')}),
    getHeadProps: () => ({style: headStyle(), ref: slotRef('head')}),
    getEyesProps: () => ({style: eyesStyle(), ref: slotRef('eyes')}),
    getAntennaProps: () => ({style: antennaStyle(), ref: slotRef('antenna')}),
    getEffectHostProps: () => ({style: effectHostStyle(), ref: slotRef('effectHost')}),
  })

  const destroy = () => {
    teardown()
    destroyed = true
  }

  return {update, registerParts, connect, destroy}
}
