import {designConfig} from './tolerances.js'

export const OVERLAYS = ['[data-conciv-root]', '[data-conciv-effects]', `[${designConfig.attributes.pane}]`] as const
