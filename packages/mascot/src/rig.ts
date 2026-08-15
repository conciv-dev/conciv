import type {MascotConfig} from './core/config.js'
import {binaryEffect} from './core/effects/binary.js'
import {createMascot} from './core/index.js'

export type {BinaryEffectConfig} from './core/effects/binary.js'
export {binaryEffect, configureBinaryEffect} from './core/effects/binary.js'
export type {
  ActivityChannels,
  CurveStyle,
  EffectContext,
  EffectHandle,
  EffectMount,
  FollowChannels,
  MascotActivity,
  MascotConfig,
  MascotConnect,
  MascotFollow,
  MascotPartProps,
  MascotPartRef,
  MascotPartRelease,
  MascotParts,
  MascotService,
  MascotSkin,
  MascotState,
} from './core/index.js'
export {createMascot, robotLayers, robotSkin} from './core/index.js'

export type RigState = 'closed' | 'open' | 'work'

export type RigLayers = {head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

export type FabRobotRig = {apply: (state: RigState) => void; destroy: () => void}

const RIG_CONFIGS: Record<RigState, MascotConfig> = {
  closed: {state: 'rest', working: false, follow: true},
  open: {state: 'awake', working: false, follow: false},
  work: {state: 'rest', working: true, follow: false},
}

function stageFor(layers: RigLayers): HTMLElement {
  const {head, eyes} = layers
  if (head.parentElement !== null && head.parentElement === eyes.parentElement) return head.parentElement
  return eyes.parentElement ?? head
}

export function createFabRobotRig(layers: RigLayers): FabRobotRig {
  const service = createMascot(RIG_CONFIGS.closed)
  service.registerParts({stage: stageFor(layers), head: layers.head, eyes: layers.eyes, antenna: layers.antenna})
  service.mountEffect('binary', binaryEffect)
  const apply = (state: RigState) => service.update(RIG_CONFIGS[state])
  return {apply, destroy: service.destroy}
}
