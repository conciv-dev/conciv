import type {Matcher} from '../../shared/types.js'
import {tileMatcher} from '../matchers/tile.js'

export const matchers: Record<string, Matcher> = {[tileMatcher.name]: tileMatcher}
