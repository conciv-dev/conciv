import {toolError, type ServerApi} from '@conciv/extension'
import type {DesignConfig} from '../shared/config.js'
import type {
  Capture,
  ColorMetric,
  DesignRuntime,
  GeometryEstimator,
  Matcher,
  PixelComparator,
  Registries,
} from '../shared/types.js'
import {adapters} from './registries/adapters.js'
import {captures} from './registries/captures.js'
import {color} from './registries/color.js'
import {deltaKinds} from './registries/delta-kinds.js'
import {enrichers} from './registries/enrichers.js'
import {geometry} from './registries/geometry.js'
import {mappers} from './registries/mappers.js'
import {matchers} from './registries/matchers.js'
import {pixel} from './registries/pixel.js'

export const REGISTRIES: Registries = {
  adapters,
  enrichers,
  captures,
  pixel,
  geometry,
  color,
  matchers,
  deltaKinds,
  mappers,
}

function notImplemented(): never {
  throw toolError('not-implemented')
}

const MISSING_CAPTURE: Capture = {name: 'missing', capture: notImplemented, clear: notImplemented}
const MISSING_PIXEL: PixelComparator = {name: 'missing', compare: notImplemented}
const MISSING_GEOMETRY: GeometryEstimator = {name: 'missing', estimate: notImplemented}
const MISSING_COLOR: ColorMetric = {name: 'missing', distance: notImplemented}
const MISSING_MATCHER: Matcher = {name: 'missing', match: notImplemented}

export function pickRuntime(input: {
  config: DesignConfig
  server: ServerApi<DesignConfig>
}): Omit<DesignRuntime, 'store' | 'cssMap' | 'xrayUrl'> {
  const {config} = input
  return {
    cwd: input.server.cwd,
    capture: REGISTRIES.captures[config.capture] ?? MISSING_CAPTURE,
    comparators: {
      pixel: REGISTRIES.pixel[config.comparator] ?? MISSING_PIXEL,
      geometry: REGISTRIES.geometry[config.geometry] ?? MISSING_GEOMETRY,
      color: REGISTRIES.color[config.color] ?? MISSING_COLOR,
      text: null,
    },
    matcher: REGISTRIES.matchers[config.matcher] ?? MISSING_MATCHER,
    adapters: REGISTRIES.adapters,
    enrichers: REGISTRIES.enrichers,
    deltaKinds: REGISTRIES.deltaKinds,
    mappers: REGISTRIES.mappers,
  }
}
