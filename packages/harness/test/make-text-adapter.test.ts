import {expect, test} from 'vitest'
import {makeTextAdapter} from '@conciv/ai/server'
import {ChatEventType} from '@conciv/ai'
import {runAdapterTurn} from '@conciv/ai/testkit'
import {lastUserModelText} from '../src/_shared/text-adapter.js'
import {scriptedRunChunks} from './helpers/scripted-chunks.js'

test('makeTextAdapter drives chat() with the provided stream fn', async () => {
  const adapter = makeTextAdapter('scripted', async function* (options) {
    yield* scriptedRunChunks(`echo:${lastUserModelText(options.messages)}`)
  })
  const chunks = await runAdapterTurn(adapter, [{role: 'user', content: 'hi'}])
  const content = chunks.find((chunk) => chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT)
  expect(content && 'delta' in content ? content.delta : undefined).toBe('echo:hi')
  expect(chunks.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
})
