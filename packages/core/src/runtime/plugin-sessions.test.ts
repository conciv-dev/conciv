import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('services', () => {
  test('a plugin tool lists the sessions, renames its own session and reads it back, and lists the models', async () => {
    const engine = await createEngine(
      {plugins: ['./test/fixtures/plugins/session-desk']},
      {
        harnesses: [
          {
            id: 'claude',
            models: [
              {id: 'opus', name: 'Opus 5.5'},
              {id: 'sonnet', name: 'Sonnet 5.5'},
            ],
          },
        ],
      },
    )
    await engine.newSession('Groceries')

    expect(await engine.session.tool('sessions_rename').call({title: 'Launch plan'})).toEqual({title: 'Launch plan'})
    expect(await engine.session.tool('sessions_titles').call({})).toEqual({
      titles: expect.arrayContaining(['Groceries', 'Launch plan']),
    })
    expect(await engine.session.tool('models_names').call({})).toEqual({
      names: expect.arrayContaining(['Opus 5.5', 'Sonnet 5.5']),
    })
  })
})
