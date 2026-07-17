import {describe, expect, it} from 'vitest'
import {bootKit} from '../../helpers/boot.js'
import {runTurn} from '../../helpers/turns.js'
import {runReal} from '../../helpers/harness-mode.js'

const PNG_RED_64x64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAAqklEQVRoBe3SsQ0AIRDEwHv675kvYgJ0ksm9Apvvzu5zdl9/pge8LliBCqCBvhAKZLwCrBAHKoACGa8AK8SBCqBAxivACnGgAiiQ8QqwQhyoAApkvAKsEAcqgAIZrwArxIEKoEDGK8AKcaACKJDxCrBCHKgACmS8AqwQByqAAhmvACvEgQqgQMYrwApxoAIokPEKsEIcqAAKZLwCrBAHKoACGa8AK8SB9QV+UoUBf2UT5GIAAAAASUVORK5CYII='

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
              {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_RED_64x64}},
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
