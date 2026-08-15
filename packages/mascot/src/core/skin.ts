import {robotLayers} from '../layers.gen.js'

export type SkinLayers = {head: string; eyes: string; antenna: string}

export type SkinFraction = {x: number; y: number}

export type MascotSkin = {
  layers: SkinLayers
  transformOrigins: SkinLayers
  originFractions: SkinFraction
  tipFractions: SkinFraction
  awakeEyeRestScaleY: number
  referenceAntennaPx: number
}

const ROBOT_ORIGIN_FRACTIONS: SkinFraction = {x: 0.5, y: 0.328}

export const robotSkin: MascotSkin = {
  layers: robotLayers,
  transformOrigins: {
    head: '50% 80%',
    eyes: '49.6% 58.6%',
    antenna: `${ROBOT_ORIGIN_FRACTIONS.x * 100}% ${ROBOT_ORIGIN_FRACTIONS.y * 100}%`,
  },
  originFractions: ROBOT_ORIGIN_FRACTIONS,
  tipFractions: {x: 0.5, y: 0.15625},
  awakeEyeRestScaleY: 1.06,
  referenceAntennaPx: 44,
}
