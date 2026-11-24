import {describe, expect, test} from 'vitest'
import {TestLLM} from '@conciv/harness-testkit'
import {createEngine} from '../engine.js'

describe('ui questions', () => {
  test('a question nobody answers tells the agent it is not answered yet', async () => {
    const engine = await createEngine({}, {timeouts: {uiCallWaitMs: 50, uiAnswerWaitMs: 50}})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_conciv_ui({kind: 'confirm', question: 'Ship the release?'})",
      }),
      TestLLM.text('Going on without the answer'),
    )

    await engine.session.send('Ask me before you ship')

    expect((await engine.requests())[1]?.messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        content: expect.stringContaining(
          'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
        ),
      }),
    )
  })
})
