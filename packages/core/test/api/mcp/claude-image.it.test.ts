import {describe, expect, it} from 'vitest'
import {bootKit} from '../../helpers/boot.js'
import {runTurn} from '../../helpers/turns.js'
import {runReal} from '../../helpers/harness-mode.js'

const PNG_RED_4x4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

describe('claude native image input', () => {
  it.skipIf(!runReal)(
    'delivers an image to claude so the model sees its pixels',
    async () => {
      const kit = await bootKit()
      try {
        const events = await runTurn(
          kit,
          {
            role: 'user',
            content: [
              {type: 'text', content: 'An image is included in this message. Reply with ONLY the dominant color name.'},
              {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_RED_4x4}},
            ],
          },
          await kit.session(),
        )
        expect(events.text().toLowerCase()).toContain('red')
      } finally {
        await kit.cleanup()
      }
    },
    120_000,
  )
})
