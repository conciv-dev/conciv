import pixelmatch from 'pixelmatch'
import type {PixelComparator} from '../../shared/types.js'
import {DIFF_OPTIONS, pixelResult} from './blazediff.js'

export const pixelmatchComparator: PixelComparator = {
  name: 'pixelmatch',
  compare: ({a, b}) => {
    const output = new Uint8Array(a.data.length)
    const count = pixelmatch(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
    return pixelResult({output, count, width: a.width, height: a.height})
  },
}
