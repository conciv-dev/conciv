import type {Skin} from '../src/skin-contract.ts'
import {concivSkin} from '../src/skin-conciv.ts'
import {terminalSkin} from '../src/skin-terminal.ts'

export const BASE_SKIN: Skin = concivSkin

export const OVERLAY_SKINS: Skin[] = [terminalSkin]

export const ALL_SKINS: Skin[] = [BASE_SKIN, ...OVERLAY_SKINS]
