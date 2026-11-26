import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('settings', () => {
  test.for(['shortcuts/keys', 'shortcuts:keys'])(
    'the engine refuses the namespace %s',
    async (namespace, {createEngine}) => {
      const engine = await createEngine()

      await expect(engine.setting({scope: 'project', namespace, key: 'send', value: 'Enter'})).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: {
          issues: [
            expect.objectContaining({
              message: 'a settings namespace is one file name inside the settings folder, without / \\ : or ?',
            }),
          ],
        },
      })
    },
  )
})
