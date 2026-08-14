import type {MascotConfig, MascotState} from './core/config.js'
import {
  createMascot,
  type MascotConnect,
  type MascotPartProps,
  type MascotPartRef,
  type MascotParts,
  type MascotService,
} from './core/mascot.js'

export {robotLayers} from './layers.gen.js'
export {createMascot}
export type {MascotConfig, MascotConnect, MascotPartProps, MascotPartRef, MascotParts, MascotService, MascotState}

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
  const apply = (state: RigState) => service.update(RIG_CONFIGS[state])
  return {apply, destroy: service.destroy}
}
