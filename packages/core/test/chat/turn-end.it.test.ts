import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {createTestkit, until} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {runTurn} from '../helpers/turns.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('extension turn-end hook', () => {
  it('fires turnEnd with the session id after the turn stream closes', async () => {
    const seen: string[] = []
    const probe = defineExtension({name: 'turn-probe', tools: []}).server(async () => ({
      context: {},
      turnEnd: (sessionId: string) => void seen.push(sessionId),
    }))
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}, extensions: [probe]})).setup()
    try {
      const sessionId = await kit.session()
      await runTurn(kit, 'hi', sessionId)
      await until(() => seen.length > 0, {hangGuardMs: 5000})
      expect(seen).toEqual([sessionId])
    } finally {
      await kit.cleanup()
    }
  }, 120_000)
})
