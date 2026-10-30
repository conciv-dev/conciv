import type {GeometryEstimator} from '../../shared/types.js'
import {edgeProjection} from '../comparators/edge-projection.js'

export const geometry: Record<string, GeometryEstimator> = {[edgeProjection.name]: edgeProjection}
