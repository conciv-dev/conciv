import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {startTestServer} from '../../helpers/server.js'
import {hasClaude, useFakeHarness} from '../../helpers/harness-mode.js'

describe('extension turn-end hook', () => {
  it.skipIf(!hasClaude() && !useFakeHarness)(
    'fires turnEnd with the session id after the turn stream closes',
    async () => {
      const seen: string[] = []
      const probe = defineExtension({name: 'turn-probe', tools: []}).server(async () => ({
        context: {},
        turnEnd: (sessionId: string) => void seen.push(sessionId),
      }))
      const {resolve, postChat, close} = await startTestServer({extensions: [probe]})
      try {
        const sessionId = await resolve()
        await postChat({role: 'user', content: 'say the word ok and nothing more'}, sessionId)
        expect(seen).toEqual([sessionId])
      } finally {
        await close()
      }
    },
    120_000,
  )
})
