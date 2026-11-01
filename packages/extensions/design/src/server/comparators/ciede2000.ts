import {differenceCiede2000, parse} from 'culori'
import type {ColorMetric} from '../../shared/types.js'

const difference = differenceCiede2000()

export const ciede2000: ColorMetric = {
  name: 'ciede2000',
  distance: ({a, b}) => {
    const left = parse(a)
    const right = parse(b)
    if (left === undefined || right === undefined) return 0
    return difference(left, right)
  },
}
