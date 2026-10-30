import type {ProvenanceMapper} from '../../shared/types.js'
import {UNKNOWN} from './jsx.js'

export const cssMapper: ProvenanceMapper = {
  via: 'css',
  applies: ({winner}) => winner.selector !== null,
  map: (input) => {
    const {selector} = input.winner
    if (selector === null) return Promise.resolve(UNKNOWN)
    const hit = input.cssMap.find({selector, property: input.property})
    if (hit === null) return Promise.resolve(UNKNOWN)
    return Promise.resolve({via: 'css', ...hit, selector})
  },
}
