import presetWind4 from '@unocss/preset-wind4'
import type {Preset} from 'unocss'
import {colors} from './colors.js'
import {radius} from './radius.js'
import {shadows} from './shadow.js'
import {font} from './fonts.js'
import {ease} from './easing.js'
import {animation} from './animation.js'
import {motion} from './motion.js'
import {effects} from './effects.js'
import {typography} from './typography.js'
import {shortcuts} from './shortcuts.js'

export function presetAidx(): Preset {
  return {
    name: '@conciv/uno-preset',

    presets: [presetWind4({preflights: {reset: false}, variablePrefix: 'unx-'}), typography],
    theme: {colors, radius, font, ease, animation},
    shortcuts: {...shortcuts, ...motion, ...effects, ...shadows},
  }
}
