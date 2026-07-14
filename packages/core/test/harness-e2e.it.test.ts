import {describe, expect, it} from 'vitest'
import {listHarnesses} from '@conciv/harness'
import {createTestHarness, createTestkit, type TestHarness} from '@conciv/harness-testkit'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {bootCoreApp} from './helpers/boot.js'

const selected = process.env.CONCIV_HARNESS_E2E
const harnesses = listHarnesses().filter((harness) => !selected || harness.id === selected)

if (selected && harnesses.length === 0) throw new Error(`Unknown CONCIV_HARNESS_E2E harness: ${selected}`)

describe('harness e2e matrix through the core server', () => {
  for (const adapter of harnesses) {
    describe(adapter.id, () => {
      it('streams a chat run lifecycle with the adapter-shaped fake harness', async () => {
        const harness = createTestHarness(adapter)
        const kit = await createTestkit(harness, bootCoreApp()).setup()
        try {
          const stream = await kit.attach()
          await kit.chat(`reply from ${adapter.id}`)
          const events = await stream.done()
          expect(events.runs()).toBe(1)
          expect(events.text()).toContain('ok')
          expect(harness.__turnMessages.at(-1)).toBeTruthy()
        } finally {
          await kit.cleanup()
        }
      })

      it('round-trips blocking UI tools through the adapter-shaped fake harness', async () => {
        const harness = createTestHarness(adapter)
        const kit = await createTestkit(harness, bootCoreApp()).setup()
        try {
          const sessionId = await kit.session()
          const stream = await kit.attach(sessionId)
          harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: `${adapter.id}?`})
          await kit.chat('go', sessionId)
          const call = await stream.waitForToolCall('conciv_ui')
          expect(call.name).toBe('conciv_ui')
          await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
          const events = await stream.done({hangGuardMs: 10_000})
          expect(events.runs()).toBe(1)
        } finally {
          await kit.cleanup()
        }
      })

      it('keeps the fake harness capabilities aligned with the real adapter', () => {
        const harness = createTestHarness(adapter)
        expect(adapterShape(harness)).toEqual(adapterShape(adapter))
      })
    })
  }
})

function adapterShape(adapter: HarnessAdapter | TestHarness): Record<string, unknown> {
  return {
    id: adapter.id,
    binName: adapter.binName,
    capabilities: adapter.capabilities,
  }
}
