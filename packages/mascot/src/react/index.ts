import {MascotAntenna} from './mascot-antenna.js'
import {MascotBinary} from './mascot-binary.js'
import {MascotEffect} from './mascot-effect.js'
import {MascotEyes} from './mascot-eyes.js'
import {MascotHead} from './mascot-head.js'
import {MascotRoot} from './mascot-root.js'

export type {ClaimToken, MascotContextValue, MascotPartName, PartClaim} from './mascot-context.js'
export {useMascotContext} from './mascot-context.js'
export type {MascotEffectProps} from './mascot-effect.js'
export type {MascotBinaryProps, MascotFollowPartProps, MascotLayerProps, MascotProps} from './mascot-props.js'
export type {
  ActivityChannels,
  CurveStyle,
  FollowChannels,
  MascotActivity,
  MascotConfig,
  MascotFollow,
  MascotSkin,
  MascotState,
} from '../core/index.js'
export {robotLayers, robotSkin} from '../core/index.js'

export const Mascot = Object.assign(MascotRoot, {
  Head: MascotHead,
  Eyes: MascotEyes,
  Antenna: MascotAntenna,
  Binary: MascotBinary,
  Effect: MascotEffect,
})
