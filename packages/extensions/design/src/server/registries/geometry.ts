import type {Registries} from '../../shared/types.js'
import {edgeProjection} from '../comparators/edge-projection.js'

export const geometry: Registries['geometry'] = {'edge-projection': edgeProjection}
