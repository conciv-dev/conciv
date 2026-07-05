import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestkit, harnessModes} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'

const claude = getHarness('claude')
if (!claude) throw new Error('claude adapter not registered')

describe('createTestkit (real server)', () => {
  for (const mode of harnessModes(claude)) {
    it.skipIf(!mode.run)(
      `[${mode.name}] streams a run lifecycle`,
      async () => {
        const kit = await createTestkit(mode.harness, bootCoreApp()).setup()
        try {
          const stream = await kit.attach()
          await kit.chat('reply with exactly PONG')
          const events = await stream.done()
          expect(events.runs()).toBe(1)
          if (mode.name === 'real') expect(events.text().toUpperCase()).toContain('PONG')
        } finally {
          await kit.cleanup()
        }
      },
      90_000,
    )

    it.skipIf(!mode.run)(
      `[${mode.name}] conciv_ui injection lands on the live stream`,
      async () => {
        const kit = await createTestkit(mode.harness, bootCoreApp()).setup()
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
