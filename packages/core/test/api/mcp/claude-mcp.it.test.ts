import {describe, expect, it} from 'vitest'
import {startTestServer} from '../../helpers/server.js'
import {hasClaude, useFakeHarness} from '../../helpers/harness-mode.js'

describe('claude → /api/mcp → uiBus', () => {
  it.skipIf(!hasClaude() || useFakeHarness)(
    'claude calls conciv_ui mid-turn and the inject lands on the live stream',
    async () => {
      const {resolve, postChat, close} = await startTestServer({harness: 'claude'})
      try {
        const body = await postChat(
          {
            role: 'user',
            content: 'Call the conciv_ui tool with kind "confirm" and question "Proceed?". Then reply DONE.',
          },
          await resolve(),
        )
        expect(body).toContain('Proceed?')
      } finally {
        await close()
      }
    },
    90_000,
  )
})
