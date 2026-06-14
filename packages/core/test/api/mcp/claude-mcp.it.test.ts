import {execSync} from 'node:child_process'
import {describe, expect, it} from 'vitest'
import {startTestServer} from '../../helpers/server.js'

function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

describe('claude → /api/mcp → uiBus', () => {
  it.skipIf(!hasClaude())(
    'claude calls aidx_ui mid-turn and the inject lands on the live stream',
    async () => {
      const {postChat, close} = await startTestServer({harness: 'claude'})
      try {
        // Real turn: claude calls the MCP tool, the inject merges onto the turn's SSE as an
        // aidx-ui CUSTOM event carrying the question — observed in the streamed body, no seam.
        const body = await postChat({
          role: 'user',
          content: 'Call the aidx_ui tool with kind "confirm" and question "Proceed?". Then reply DONE.',
        })
        expect(body).toContain('Proceed?')
      } finally {
        await close()
      }
    },
    90_000,
  )
})
