import {describe, expect, test} from 'vitest'
import {activityChannels, followChannels} from './config.js'

describe('mascot defaults', () => {
  test.each([
    [true, {eyes: true, antenna: true}],
    [false, {eyes: false, antenna: false}],
  ])('follow set to %s turns both the eyes and the antenna to %o', (follow, channels) => {
    expect(followChannels(follow)).toEqual(channels)
  })

  test.each([
    [undefined, {bob: true, throb: true, blink: true}],
    [{blink: false}, {bob: true, throb: true, blink: false}],
    [
      {bob: false, throb: false},
      {bob: false, throb: false, blink: true},
    ],
  ])('the activity %o works with the channels %o, every unnamed one on', (activity, channels) => {
    expect(activityChannels(activity)).toEqual(channels)
  })
})
