import type {FollowChannels, MascotConfig, MascotFollow, MascotState} from './core/config.js'
import {binaryEffect} from './core/effects/binary.js'
import type {EffectContext, EffectHandle, EffectMount} from './core/effects/effect.js'
import {
  createMascot,
  type MascotConnect,
  type MascotPartProps,
  type MascotPartRef,
  type MascotParts,
  type MascotService,
} from './core/mascot.js'
import {type MascotSkin, robotSkin} from './core/skin.js'

export {robotLayers} from './layers.gen.js'
export {binaryEffect, createMascot, robotSkin}
export type {
  EffectContext,
  EffectHandle,
  EffectMount,
  FollowChannels,
  MascotConfig,
  MascotConnect,
  MascotFollow,
  MascotPartProps,
  MascotPartRef,
  MascotParts,
  MascotService,
  MascotSkin,
  MascotState,
}

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
