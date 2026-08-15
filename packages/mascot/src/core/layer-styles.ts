import type {MascotSkin} from './skin.js'

type LayerStyles = {head: Record<string, string>; eyes: Record<string, string>; antenna: Record<string, string>}

const LAYER_STYLE: Record<string, string> = {
  position: 'absolute',
  inset: '0',
  'background-repeat': 'no-repeat',
  'background-position': 'center',
  'background-size': 'contain',
  'image-rendering': 'pixelated',
  'will-change': 'transform',
}

const LAYER_DEPTH = {head: '0', antenna: '1', eyes: '2', effect: '3'} as const

const layerStyle = (image: string, depth: string): Record<string, string> =>
  Object.freeze({...LAYER_STYLE, 'z-index': depth, 'background-image': `url('${image}')`})

const ROOT_STYLE: Record<string, string> = Object.freeze({position: 'relative', display: 'block'})

const EFFECT_HOST_STYLE: Record<string, string> = Object.freeze({
  position: 'absolute',
  inset: '0',
  'z-index': LAYER_DEPTH.effect,
  'pointer-events': 'none',
})

const skinStyles = new WeakMap<MascotSkin, LayerStyles>()

function stylesFor(skin: MascotSkin): LayerStyles {
  const existing = skinStyles.get(skin)
  if (existing !== undefined) return existing
  const styles: LayerStyles = {
    head: layerStyle(skin.layers.head, LAYER_DEPTH.head),
    eyes: layerStyle(skin.layers.eyes, LAYER_DEPTH.eyes),
    antenna: layerStyle(skin.layers.antenna, LAYER_DEPTH.antenna),
  }
  skinStyles.set(skin, styles)
  return styles
}

export const rootStyle = (): Record<string, string> => ROOT_STYLE

export const effectHostStyle = (): Record<string, string> => EFFECT_HOST_STYLE

export const headStyle = (skin: MascotSkin): Record<string, string> => stylesFor(skin).head

export const eyesStyle = (skin: MascotSkin): Record<string, string> => stylesFor(skin).eyes

export const antennaStyle = (skin: MascotSkin): Record<string, string> => stylesFor(skin).antenna
