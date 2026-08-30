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
          const turn = await kit.chat('reply with exactly PONG')
          const events = await turn.done()
          expect(events.runs()).toBe(1)
          if (mode.name === 'real') expect(events.text().toUpperCase()).toContain('PONG')
        } finally {
          await kit.cleanup()
        }
      },
      90_000,
    )

    it.skipIf(!mode.run)(
      `[${mode.name}] blocking conciv_ui round-trips the user answer as the tool result`,
      async () => {
        const kit = await createTestkit(mode.harness, bootCoreApp()).setup()
        try {
          const sessionId = await kit.session()
          if (mode.name === 'fake') {
            mode.harness.script.scriptToolCall('execute_typescript', {
              typescriptCode: "return await external_conciv_ui({kind: 'confirm', question: 'Proceed?'})",
            })
          }
          const instruction =
            mode.name === 'fake'
              ? 'go'
              : 'Inside execute_typescript, call external_conciv_ui with kind confirm, question "Proceed?". Then reply DONE.'
          const turn = await kit.chat(instruction, sessionId)
          const call = await turn.waitForToolCall('conciv_ui')
          expect(call.name).toBe('conciv_ui')
          await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
          await turn.done({hangGuardMs: 60_000})
        } finally {
          await kit.cleanup()
        }
      },
      120_000,
    )
  }
})
