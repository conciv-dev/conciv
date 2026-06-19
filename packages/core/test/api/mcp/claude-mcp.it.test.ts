import {describe, expect, it} from 'vitest'
import {startTestServer} from '../../helpers/server.js'
import {hasClaude, useFakeHarness} from '../../helpers/harness-mode.js'

describe('claude → /api/mcp → uiBus', () => {
  it.skipIf(!hasClaude() || useFakeHarness)(
    'claude calls mandarax_ui mid-turn and the inject lands on the live stream',
    async () => {
      const {resolve, postChat, close} = await startTestServer({harness: 'claude'})
      try {
        // Real turn: claude calls the MCP tool, the inject merges onto the turn's SSE as an
        // mandarax-ui CUSTOM event carrying the question — observed in the streamed body, no seam.
        const body = await postChat(
          {
            role: 'user',
            content: 'Call the mandarax_ui tool with kind "confirm" and question "Proceed?". Then reply DONE.',
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
