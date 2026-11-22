import {describe, expect, test} from 'vitest'
import {
  GRAB_FILE_NAME,
  GRAB_MIME,
  MAX_PAYLOAD_BYTES,
  grabToFile,
  grabToPayload,
  imagePreviewBudget,
  parseGrabPayload,
} from './grab-attachment.js'

describe('the grab payload', () => {
  test('a pick keeps its text, snippet, source, rect and preview, and the attached file reads back the same', async () => {
    const grab = {
      text: 'Send button',
      snippet: '<button>Send</button>',
      source: {componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: 12},
      rect: {x: 10, y: 20, width: 80, height: 32},
      preview: {kind: 'dom' as const, html: '<button>Send</button>', width: 80, height: 32},
    }

    const file = grabToFile(grab)

    expect(file.name).toBe(GRAB_FILE_NAME)
    expect(file.type).toBe(GRAB_MIME)
    expect(parseGrabPayload(await file.text())).toEqual({
      text: 'Send button',
      snippet: '<button>Send</button>',
      source: {componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: 12},
      rect: {x: 10, y: 20, width: 80, height: 32},
      preview: {kind: 'dom', html: '<button>Send</button>', width: 80, height: 32},
    })
  })

  test.each([
    ['not JSON', '{"text":'],
    ['JSON of another shape', JSON.stringify({text: 1, source: null, rect: null, preview: null})],
    [
      'a preview whose data URL is not an image',
      JSON.stringify({
        text: 'Send button',
        source: null,
        rect: null,
        preview: {kind: 'image', dataUrl: 'javascript:alert(1)', width: 1, height: 1},
      }),
    ],
    [
      'longer than the budget',
      JSON.stringify({text: 'a'.repeat(MAX_PAYLOAD_BYTES), source: null, rect: null, preview: null}),
    ],
  ])('a string that is %s is not a grab', (_case, raw) => {
    expect(parseGrabPayload(raw)).toBeNull()
  })

  test('an image preview that fills the budget is kept, and one byte more drops the preview and the snippet', () => {
    const grab = {
      text: 'Send button',
      snippet: '<button>Send</button>',
      source: {componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: 12},
      rect: {x: 10, y: 20, width: 80, height: 32},
      preview: {kind: 'image' as const, dataUrl: '', width: 80, height: 32},
    }
    const prefix = 'data:image/png;base64,'
    const budget = imagePreviewBudget(grab, grab.preview)
    const fitting = {...grab.preview, dataUrl: `${prefix}${'A'.repeat(budget - prefix.length)}`}
    const over = {...grab.preview, dataUrl: `${fitting.dataUrl}A`}

    expect(grabToPayload({...grab, preview: fitting})).toEqual({
      text: 'Send button',
      snippet: '<button>Send</button>',
      source: grab.source,
      rect: grab.rect,
      preview: fitting,
    })
    expect(grabToPayload({...grab, preview: over})).toEqual({
      text: 'Send button',
      source: grab.source,
      rect: grab.rect,
      preview: null,
    })
  })

  test('a text too long for the budget is cut on a whole character, ends in an ellipsis and fits', () => {
    const grab = {
      text: '\u{1F600}'.repeat(MAX_PAYLOAD_BYTES),
      source: {componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: 12},
      rect: {x: 10, y: 20, width: 80, height: 32},
      preview: {kind: 'dom' as const, html: '<button>Send</button>', width: 80, height: 32},
    }

    const payload = grabToPayload(grab)
    const characters = Array.from(payload.text)

    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
    expect(characters.at(-1)).toBe('…')
    expect(characters.slice(0, -1).every((character) => character === '\u{1F600}')).toBe(true)
    expect(payload).toMatchObject({source: grab.source, rect: grab.rect, preview: null})
  })
})
