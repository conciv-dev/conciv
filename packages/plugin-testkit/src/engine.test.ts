import {test, expect} from 'vitest'
import {TestLLM} from '@conciv/harness-testkit'
import {createEngine} from './engine.js'

test('a held turn runs on release, and its skill call runs once approved', async () => {
  const engine = await createEngine({
    permission: {skill: 'ask'},
    replies: [TestLLM.toolCall('call-skill', 'skill', {id: 'conciv'}), TestLLM.text('Loaded', 'text-loaded')],
  })
  const gate = await engine.gate()
  const sent = engine.session.send('load the conciv skill')
  await gate.started
  await gate.release()
  await engine.session.approve()
  await expect(sent).resolves.toBeUndefined()
})
