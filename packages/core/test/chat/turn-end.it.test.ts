import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {createTestkit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {runTurn} from '../helpers/turns.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('extension turn-end hook', () => {
  it('fires turnEnd with the session id after the turn stream closes', async () => {
    const seen: string[] = []
    const turnEnd = {resolve: (_sessionId: string) => {}}
    const ended = new Promise<string>((resolve) => (turnEnd.resolve = resolve))
    const probe = defineExtension({name: 'turn-probe', tools: []}).server(async () => ({
      context: {},
      turnEnd: (sessionId: string) => {
        seen.push(sessionId)
        turnEnd.resolve(sessionId)
      },
    }))
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}, extensions: [probe]})).setup()
    try {
      const sessionId = await kit.session()
      await runTurn(kit, 'hi', sessionId)
      expect(await ended).toBe(sessionId)
      expect(seen).toEqual([sessionId])
    } finally {
      await kit.cleanup()
    }
  }, 120_000)
})
