import {describe, expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('asking tools', () => {
  test('the agent calls a tool that asks, and approving once lets it run', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/asking-notes']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_notes_publish({title: 'Launch plan'})",
      }),
      TestLLM.text('Published'),
    )

    const sent = engine.session.send('Publish the launch plan')
    await engine.session.approve()
    await sent

    expect((await engine.requests())[1]?.messages).toContainEqual(
      expect.objectContaining({role: 'tool', content: expect.stringContaining('Launch plan')}),
    )
  })

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
