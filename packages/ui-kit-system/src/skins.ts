import type {Skin} from './skin-contract.js'
import {concivSkin} from './skin-conciv.js'
import {terminalSkin} from './skin-terminal.js'

export const SKINS = {conciv: concivSkin, terminal: terminalSkin} as const

export type SkinName = keyof typeof SKINS

export const DEFAULT_SKIN_NAME: SkinName = 'conciv'

export const SKIN_NAMES: SkinName[] = Object.keys(SKINS).filter((name): name is SkinName => name in SKINS)

export function isSkinName(value: string): value is SkinName {
  return value in SKINS
}

export function skinDefinition(name: SkinName): Skin {
  return SKINS[name]
}
