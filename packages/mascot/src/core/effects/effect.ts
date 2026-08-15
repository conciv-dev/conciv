import type {EmitterAnchor} from '../path.js'
import type {MascotSkin} from '../skin.js'

export type EffectContext = {
  host: HTMLElement
  stage: HTMLElement
  antenna: HTMLElement
  skin: MascotSkin
}

export type EffectHandle = {
  start: () => void
  stop: (onRested: () => void) => void
  rest: () => void
  remove: () => void
  anchor?: (tip: EmitterAnchor) => void
}

export type EffectMount = (context: EffectContext) => EffectHandle
