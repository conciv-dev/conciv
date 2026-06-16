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

// A 4×4 solid-red PNG, base64.
const PNG_RED_4x4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

describe('claude native image input', () => {
  it.skipIf(!hasClaude())(
    'delivers an image to claude so the model sees its pixels',
    async () => {
      const {resolve, postChat, close} = await startTestServer({harness: 'claude'})
      try {
        const body = await postChat(
          {
            role: 'user',
            content: [
              {type: 'text', content: 'An image is included in this message. Reply with ONLY the dominant color name.'},
              {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_RED_4x4}},
            ],
          },
          await resolve(),
        )
        expect(body.toLowerCase()).toContain('red')
      } finally {
        await close()
      }
    },
    120_000,
  )
})
