import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('start', () => {
  test('a malformed access token is refused at start', async () => {
    await expect(createEngine({}, {port: 'connect', token: 'not-a-uuid'})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )
  })
})
