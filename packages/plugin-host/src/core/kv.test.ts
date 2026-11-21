import {realpathSync} from 'node:fs'
import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {createEngine} from '@conciv/plugin-testkit'

describe('plugin storage', () => {
  test("a plugin reads back what it stored, a missing key reads as nothing, and its folder lives in the engine's state", async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/notebook']})

    expect(await engine.session.tool('note_write').call({key: 'greeting', value: 'Shalom'})).toEqual({
      kept: 'greeting',
    })
    expect(await engine.session.tool('note_read').call({key: 'greeting'})).toEqual({value: 'Shalom'})
    expect(await engine.session.tool('note_read').call({key: 'missing'})).toEqual({value: null})

    const {directory} = z.object({directory: z.string()}).parse(await engine.session.tool('note_directory').call({}))
    expect(realpathSync(directory)).toContain(`${engine.root}/`)
    expect(directory).toContain('plugin-storage')
  })

  test('what a plugin stored survives an engine restart', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/notebook']})

    await engine.session.tool('note_write').call({key: 'greeting', value: 'Shalom'})
    await engine.restart()

    expect(await engine.session.tool('note_read').call({key: 'greeting'})).toEqual({value: 'Shalom'})
  })
})
