import {designConfig} from './tolerances.js'

export const OVERLAYS = ['[data-conciv-root]', '[data-conciv-effects]', `[${designConfig.attributes.overlay}]`] as const
