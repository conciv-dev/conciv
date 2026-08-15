import {expect, test} from 'vitest'
import {grabAttachment} from '../src/server/grab-attachment.js'
import pageServerExtension from '../src/server.js'

const PAYLOAD = {text: '<h1>Start simple</h1> at src/routes/index.tsx:12:9', source: null, rect: null, preview: null}

function grabPart(body: string) {
  return {
    type: 'document' as const,
    source: {type: 'data' as const, mimeType: grabAttachment.mime, value: Buffer.from(body, 'utf8').toString('base64')},
  }
}

test('a grab attachment expands into grounding text', async () => {
  const expand = grabAttachment.__expand
  if (!expand) throw new Error('expected the grab attachment to declare a server expander')

  expect(await expand(grabPart(JSON.stringify(PAYLOAD)), {})).toEqual([{type: 'text', content: PAYLOAD.text}])
})

test('the page server extension carries the grab attachment expander', () => {
  const declared = pageServerExtension.attachments?.find((entry) => entry.mime === grabAttachment.mime)

  expect(declared?.__expand).toBeTypeOf('function')
})

test('an unreadable grab payload expands to nothing rather than throwing', async () => {
  const expand = grabAttachment.__expand
  if (!expand) throw new Error('expected the grab attachment to declare a server expander')

  expect(await expand(grabPart('nope'), {})).toEqual([])
})
