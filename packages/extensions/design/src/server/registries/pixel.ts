import type {PixelComparator} from '../../shared/types.js'
import {blazediffComparator} from '../comparators/blazediff.js'
import {pixelmatchComparator} from '../comparators/pixelmatch.js'

export const pixel: Record<string, PixelComparator> = {
  [blazediffComparator.name]: blazediffComparator,
  [pixelmatchComparator.name]: pixelmatchComparator,
}
