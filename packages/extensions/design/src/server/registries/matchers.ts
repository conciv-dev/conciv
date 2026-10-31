import type {Registries} from '../../shared/types.js'
import {tileMatcher} from '../matchers/tile.js'

export const matchers: Registries['matchers'] = {tile: tileMatcher}
