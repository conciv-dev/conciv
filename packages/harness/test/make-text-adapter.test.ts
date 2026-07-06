import {expect, test} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import {lastUserModelText, makeTextAdapter} from '../src/_shared/text-adapter.js'
import {scriptedRunChunks} from './helpers/scripted-chunks.js'

test('makeTextAdapter drives chat() with the provided stream fn', async () => {
  const adapter = makeTextAdapter('scripted', async function* (options) {
    yield* scriptedRunChunks(`echo:${lastUserModelText(options.messages)}`)
  })
  const chunks: StreamChunk[] = []
  for await (const chunk of chat({adapter, messages: [{role: 'user', content: 'hi'}]})) chunks.push(chunk)
  const content = chunks.find((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
  expect(content && 'delta' in content ? content.delta : undefined).toBe('echo:hi')
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
})
