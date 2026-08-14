import {robotLayers} from '../layers.gen.js'

const LAYER_STYLE: Record<string, string> = {
  position: 'absolute',
  inset: '0',
  'background-repeat': 'no-repeat',
  'background-position': 'center',
  'background-size': 'contain',
  'image-rendering': 'pixelated',
  'will-change': 'transform',
}

const layerStyle = (image: string): Record<string, string> => ({...LAYER_STYLE, 'background-image': `url('${image}')`})

const ROOT_STYLE: Record<string, string> = {position: 'relative', display: 'block'}

const EFFECT_HOST_STYLE: Record<string, string> = {position: 'absolute', inset: '0', 'pointer-events': 'none'}

const HEAD_STYLE = layerStyle(robotLayers.head)

const EYES_STYLE = layerStyle(robotLayers.eyes)

const ANTENNA_STYLE = layerStyle(robotLayers.antenna)

export const rootStyle = (): Record<string, string> => ({...ROOT_STYLE})

export const effectHostStyle = (): Record<string, string> => ({...EFFECT_HOST_STYLE})

export const headStyle = (): Record<string, string> => ({...HEAD_STYLE})

export const eyesStyle = (): Record<string, string> => ({...EYES_STYLE})

export const antennaStyle = (): Record<string, string> => ({...ANTENNA_STYLE})
