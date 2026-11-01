import type {ServerApi} from '@conciv/extension'
import type {DesignConfig} from '../shared/config.js'
import type {DesignRuntime, Registries} from '../shared/types.js'
import {adapters} from './registries/adapters.js'
import {captures} from './registries/captures.js'
import {color} from './registries/color.js'
import {deltaKinds} from './registries/delta-kinds.js'
import {enrichers} from './registries/enrichers.js'
import {geometry} from './registries/geometry.js'
import {mappers} from './registries/mappers.js'
import {matchers} from './registries/matchers.js'
import {pixel} from './registries/pixel.js'
import {text} from './registries/text.js'

export const REGISTRIES: Registries = {
  adapters,
  enrichers,
  captures,
  pixel,
  geometry,
  color,
  matchers,
  text,
  deltaKinds,
  mappers,
}

export function pickRuntime(input: {
  config: DesignConfig
  server: ServerApi<DesignConfig>
}): Omit<DesignRuntime, 'store' | 'cssMap' | 'xrayUrl'> {
  const {config} = input
  return {
    cwd: input.server.cwd,
    capture: REGISTRIES.captures[config.capture],
    comparators: {
      pixel: REGISTRIES.pixel[config.comparator],
      geometry: REGISTRIES.geometry[config.geometry],
      color: REGISTRIES.color[config.color],
      text: REGISTRIES.text[config.text],
    },
    matcher: REGISTRIES.matchers[config.matcher],
    adapters: REGISTRIES.adapters,
    enrichers: REGISTRIES.enrichers,
    deltaKinds: REGISTRIES.deltaKinds,
    mappers: REGISTRIES.mappers,
  }
}
