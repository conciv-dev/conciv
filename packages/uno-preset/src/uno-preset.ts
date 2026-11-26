import presetWind4 from '@unocss/preset-wind4'
import {fileURLToPath} from 'node:url'
import type {Preset, UserConfig} from 'unocss'
import {colors} from './colors.js'
import {radius} from './radius.js'
import {shadows} from './shadow.js'
import {font} from './fonts.js'
import {ease} from './easing.js'
import {animation} from './animation.js'
import {text} from './type-scale.js'
import {duration} from './duration.js'
import {spacing} from './spacing.js'
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

export interface PresetConcivOptions {
  readonly sheet?: 'app' | 'plugin'
}

export function presetConciv(options: PresetConcivOptions = {}): Preset {
  const plugin = options.sheet === 'plugin'

  return {
    name: '@internal/uno-preset',

    presets: [
      presetWind4({preflights: {reset: false, theme: !plugin}, variablePrefix: 'unx-', dark: 'class'}),
      typography,
    ],
    rules: [jsonTree, ...densityRules, ...loaderRules],
    preflights: plugin ? [] : [loaderPreflight],
    separators: [':'],
    theme: {colors, radius, font, ease, animation, text, duration, spacing},
    shortcuts: {...shortcuts, ...motion, ...effects, ...shadows, ...loaderShortcuts},
  }
}

export function pluginSheetConfig(packageUrl: string): UserConfig {
  const source = fileURLToPath(new URL('src', packageUrl))
  const include = `${source}/**/*.{ts,tsx}`
  const exclude = `${source}/**/*.{test,spec,stories}.*`

  return {
    content: {
      pipeline: {include: [include], exclude: [exclude]},
      filesystem: [include, `!${exclude}`],
    },
    presets: [presetConciv({sheet: 'plugin'})],
  }
}
