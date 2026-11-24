import {describe, expect, test} from 'vitest'
import {createEngine} from '../../test/engine.js'

describe('other engines', () => {
  test('a plugin lists every engine running on the machine on its first read', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/engine-lister']})
    await createEngine({}, {home: engine.home})

    expect(await engine.session.tool('engines_list').call({})).toEqual({
      ids: [expect.any(String), expect.any(String)],
    })
  })
})
