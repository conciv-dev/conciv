import type {Enricher} from '../../shared/types.js'
import {colorEnricher} from '../enrichers/color.js'

export const enrichers: Enricher[] = [colorEnricher]
