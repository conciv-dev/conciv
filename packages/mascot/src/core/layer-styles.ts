import type {MascotSkin} from './skin.js'

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

export const rootStyle = (): Record<string, string> => ({...ROOT_STYLE})

export const effectHostStyle = (): Record<string, string> => ({...EFFECT_HOST_STYLE})

export const headStyle = (skin: MascotSkin): Record<string, string> => layerStyle(skin.layers.head)

export const eyesStyle = (skin: MascotSkin): Record<string, string> => layerStyle(skin.layers.eyes)

export const antennaStyle = (skin: MascotSkin): Record<string, string> => layerStyle(skin.layers.antenna)
