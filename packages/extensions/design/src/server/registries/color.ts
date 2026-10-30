import type {ColorMetric} from '../../shared/types.js'
import {ciede2000} from '../comparators/ciede2000.js'

export const color: Record<string, ColorMetric> = {[ciede2000.name]: ciede2000}
