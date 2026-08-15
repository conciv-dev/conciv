import {MascotAntenna} from './mascot-antenna.js'
import {MascotBinary} from './mascot-binary.js'
import {MascotEyes} from './mascot-eyes.js'
import {MascotHead} from './mascot-head.js'
import {MascotRoot} from './mascot-root.js'

export type {MascotContextValue, MascotPartName} from './mascot-context.js'
export {useMascotContext} from './mascot-context.js'
export type {MascotBinaryProps, MascotLayerProps, MascotProps} from './mascot-props.js'
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
})
