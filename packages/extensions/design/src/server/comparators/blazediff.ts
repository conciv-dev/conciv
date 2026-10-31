import {diff} from '@blazediff/core'
import type {PixelComparator, PixelRegion} from '../../shared/types.js'
import {diffMask, findRegions} from '../raster.js'

export const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const

export function pixelResult(input: {output: Uint8Array; count: number; width: number; height: number}): {
  mismatch: number
  mask: Uint8Array
  regions: PixelRegion[]
} {
  const {output, count, width, height} = input
  const total = width * height
  const mask = diffMask({output, width, height})
  return {
    mismatch: total === 0 ? 0 : count / total,
    mask,
    regions: findRegions({mask, width, height, minSize: 1}).map((box) => ({box, kind: 'changed'})),
  }
}

export const blazediffComparator: PixelComparator = {
  name: 'blazediff',
  compare: ({a, b}) => {
    const output = new Uint8Array(a.data.length)
    const count = diff(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
    return pixelResult({output, count, width: a.width, height: a.height})
  },
}
