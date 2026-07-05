import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness, createTestkit, harnessAvailable} from '@conciv/harness-testkit'

const claude = getHarness('claude')
if (!claude) throw new Error('claude adapter not registered')

const modes = [
  {name: 'fake', harness: createTestHarness(claude), run: true},
  {name: 'real', harness: claude, run: harnessAvailable(claude)},
]

describe('claude → /api/mcp → uiBus', () => {
  for (const mode of modes) {
    it.skipIf(!mode.run)(
      `[${mode.name}] conciv_ui injection lands on the live stream`,
      async () => {
        const kit = await createTestkit(mode.harness).setup()
        try {
          const stream = await kit.attach()
          await kit.invokeTool(
            'conciv_ui',
            {kind: 'confirm', question: 'Proceed?'},
            {instruction: 'Call the conciv_ui tool with kind confirm, question "Proceed?". Then reply DONE.'},
          )
          const spec = await stream.waitForUiSpec('Proceed?')
          expect('question' in spec && spec.question).toBe('Proceed?')
        } finally {
          await kit.cleanup()
        }
      },
      90_000,
    )
  }
})
