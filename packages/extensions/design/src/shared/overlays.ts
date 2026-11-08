import type {Widget} from './defs.js'
import {designConfig} from './tolerances.js'

export function hiddenOverlays(widget: Widget): string[] {
  if (widget === 'shown') return []
  return ['[data-conciv-root]', '[data-conciv-effects]', `[${designConfig.attributes.overlay}]`]
}
