import type {Registries} from '../../shared/types.js'
import {blazediffComparator} from '../comparators/blazediff.js'
import {pixelmatchComparator} from '../comparators/pixelmatch.js'

export const pixel: Registries['pixel'] = {
  blazediff: blazediffComparator,
  pixelmatch: pixelmatchComparator,
}
