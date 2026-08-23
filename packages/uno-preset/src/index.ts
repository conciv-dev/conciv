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
import {jsonTree} from './json-tree.js'
import {densityRules} from './density.js'
import {loaderShortcuts, loaderRules, loaderPreflight} from './loader.js'

export {DENSITY_CLASS} from './density.js'
export {colors as chatColors} from './colors.js'
export {radius as chatRadius} from './radius.js'
export {font as chatFont} from './fonts.js'
export {ease as chatEase} from './easing.js'

export function presetConciv(): Preset {
  return {
    name: '@conciv/uno-preset',

    presets: [presetWind4({preflights: {reset: false}, variablePrefix: 'unx-', dark: 'class'}), typography],
    rules: [jsonTree, ...densityRules, ...loaderRules],
    preflights: [loaderPreflight],
    separators: [':'],
    theme: {colors, radius, font, ease, animation},
    shortcuts: {...shortcuts, ...motion, ...effects, ...shadows, ...loaderShortcuts},
  }
}
