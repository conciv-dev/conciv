import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('asking tools', () => {
  test('a config rule that allows the tool runs it without an ask', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/asking-notes'],
      permission: {notes_publish: 'allow'},
    })

    expect(await engine.session.tool('notes_publish').call({title: 'Launch plan'})).toEqual({published: 'Launch plan'})
  })

  test('a config rule that denies the tool refuses it without an ask', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/asking-notes'],
      permission: {notes_publish: 'deny'},
    })

    expect(await engine.session.tool('notes_publish').failure({title: 'Launch plan'})).toMatchObject({
      message: expect.stringContaining("'external_notes_publish' is not defined"),
    })
  })
})
