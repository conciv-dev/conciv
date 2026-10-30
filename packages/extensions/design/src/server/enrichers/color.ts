import type {Enricher} from '../../shared/types.js'
import {crop, edgeMap, foregroundColor, medianColor} from '../raster.js'

export const colorEnricher: Enricher = {
  name: 'color',
  applies: (node) => node.fills === undefined,
  run: ({node, raster}) => {
    const tile = crop({raster, box: node.box}).raster
    const edges = edgeMap(tile)
    return Promise.resolve({
      fills: {
        background: medianColor({raster: tile, exclude: edges}),
        foreground: foregroundColor({raster: tile, edges}),
      },
      confidence: 0.8,
    })
  },
}
