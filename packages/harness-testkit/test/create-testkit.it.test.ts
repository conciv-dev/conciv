import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '../src/create-test-harness.js'
import {createTestkit} from '../src/create-testkit.js'

describe('createTestkit (fake harness, real server)', () => {
  it('streams a run lifecycle', async () => {
    const claude = getHarness('claude')
    if (!claude) throw new Error('no claude')
    const kit = await createTestkit(createTestHarness(claude)).setup()
    try {
      const stream = await kit.attach()
      await kit.chat('hello')
      const events = await stream.done()
      expect(events.runs()).toBe(1)
    } finally {
      await kit.cleanup()
    }
  }, 20_000)

  it('conciv_ui injection lands on the live stream', async () => {
    const claude = getHarness('claude')
    if (!claude) throw new Error('no claude')
    const kit = await createTestkit(createTestHarness(claude)).setup()
    try {
      const stream = await kit.attach()
      await kit.invokeTool(
        'conciv_ui',
        {kind: 'confirm', question: 'Proceed?'},
        {instruction: 'Call the conciv_ui tool with kind confirm, question "Proceed?".'},
      )
      const spec = await stream.waitForUiSpec('Proceed?')
      expect('question' in spec && spec.question).toBe('Proceed?')
    } finally {
      await kit.cleanup()
    }
  }, 20_000)
})
