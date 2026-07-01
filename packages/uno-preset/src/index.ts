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

// Shared aidx token system + preset every package pulls in (`presets: [presetAidx()]`). Each subsystem
// lives in its own file (colors/radius/shadow/fonts/easing/motion/typography/shortcuts); the runtime
// --pw-* values stay in tokens.css. Goal: component code uses named utilities only — no [var(--pw-*)].
// presetWind4 (TW v4-aligned): native animate-*/aria-*/sr-only/list-none replace hand-rolled mini gaps.
export function presetAidx(): Preset {
  return {
    name: '@conciv/uno-preset',
    // reset:false (packages own @unocss/reset); variablePrefix:'unx-' namespaces wind4's @property-registered --un-* vars (shadow.ts hoists them to <head>) so they can't collide with a host app's own UnoCSS.
    presets: [presetWind4({preflights: {reset: false}, variablePrefix: 'unx-'}), typography],
    theme: {colors, radius, font, ease, animation},
    shortcuts: {...shortcuts, ...motion, ...effects, ...shadows},
  }
}
