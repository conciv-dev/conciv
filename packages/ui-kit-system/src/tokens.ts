import {anchorTokenDefinitions, type TokenDefinition} from './skin-contract.js'
import {DERIVED_TOKENS} from './derived-tokens.js'
import {concivSkin} from './skin-conciv.js'

export type {TokenDefinition}

export const TOKENS: Record<string, TokenDefinition> = {...anchorTokenDefinitions(concivSkin), ...DERIVED_TOKENS}
