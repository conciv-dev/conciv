import {describe, expect, it} from 'vitest'
import type {ToolResultPart} from '@tanstack/ai-client'
import {parseResultMedia} from '../src/tools/primitives/result-media.js'

function resultOf(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 't1', content, state: 'complete'}
}

describe('parseResultMedia', () => {
  it('returns an empty json when there is no result', () => {
    expect(parseResultMedia(undefined)).toEqual({json: undefined})
  })

  it('parses a plain json object result with no image', () => {
    const media = parseResultMedia(resultOf(JSON.stringify({cleared: 3})))
    expect(media).toEqual({json: {cleared: 3}})
  })

  it('extracts the data-url image and the json text part from a mixed content array', () => {
    const content = JSON.stringify([
      {type: 'image', source: {type: 'data', value: 'QUJD', mimeType: 'image/png'}},
      {type: 'text', content: JSON.stringify({committed: true, elements: 2})},
    ])
    const media = parseResultMedia(resultOf(content))
    expect(media).toEqual({json: {committed: true, elements: 2}, imageUrl: 'data:image/png;base64,QUJD'})
  })
})
