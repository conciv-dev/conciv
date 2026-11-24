import {realpathSync} from 'node:fs'
import {describe, expect} from 'vitest'
import {test} from '../engine.js'
import {z} from 'zod'

describe('plugin storage', () => {
  test("a plugin reads back what it stored, a missing key reads as nothing, its folder lives in the engine's state, and what it stored survives an engine restart", async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['./test/plugin-host/fixtures/plugins/notebook']})

    expect(await engine.session.tool('note_write').call({key: 'greeting', value: 'Shalom'})).toEqual({
      kept: 'greeting',
    })
    expect(await engine.session.tool('note_read').call({key: 'greeting'})).toEqual({value: 'Shalom'})
    expect(await engine.session.tool('note_read').call({key: 'missing'})).toEqual({value: null})

    const {directory} = z.object({directory: z.string()}).parse(await engine.session.tool('note_directory').call({}))
    expect(realpathSync(directory)).toContain(`${engine.root}/`)
    expect(directory).toContain('plugin-storage')

    await engine.restart()
    expect(await engine.session.tool('note_read').call({key: 'greeting'})).toEqual({value: 'Shalom'})
  })
})
