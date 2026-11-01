import type {Enricher} from '../../shared/types.js'
import {ciede2000} from '../comparators/ciede2000.js'
import {sampledFills} from '../deltas/colors.js'

export const colorEnricher: Enricher = {
  name: 'color',
  applies: (node) => node.fills === undefined,
  run: ({node, raster}) => {
    const {background, foreground} = sampledFills({raster, box: node.box, glyphs: [node.box], color: ciede2000})
    return Promise.resolve({
      fills: foreground === null ? {background} : {background, foreground},
      confidence: 0.8,
    })
  },
}
