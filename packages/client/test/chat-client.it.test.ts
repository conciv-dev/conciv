import {afterEach, describe, expect, it} from 'vitest'
import {ChatClient, type UIMessage} from '@tanstack/ai-client'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

type Observed = {
  messages: UIMessage[]
  generating: boolean
  connectionStatus: string
}

function observeClient(kitBase: string, sessionId: string): {client: ChatClient; observed: Observed} {
  const observed: Observed = {messages: [], generating: false, connectionStatus: 'disconnected'}
  const client = new ChatClient({
    connection: chatConnection(makeRpcClient(kitBase), sessionId),
    onMessagesChange: (messages) => {
      observed.messages = messages
    },
    onSessionGeneratingChange: (isGenerating) => {
      observed.generating = isGenerating
    },
    onConnectionStatusChange: (status) => {
      observed.connectionStatus = status
    },
  })
  return {client, observed}
}

const textOf = (message: UIMessage): string =>
  message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')

describe('ChatClient over chatConnection (useChatSession composition, headless)', () => {
  it('sendMessage round-trips: user message renders, assistant text streams in, generating settles', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const {client, observed} = observeClient(kit.base, sessionId)
    client.subscribe()
    try {
      await until(() => observed.connectionStatus === 'connected', {hangGuardMs: 5000})
      await client.sendMessage('hello')
      await until(
        () => observed.messages.some((message) => message.role === 'assistant' && textOf(message).includes('ok')),
        {hangGuardMs: 5000},
      )
      expect(observed.messages[0]?.role).toBe('user')
      await until(() => !observed.generating, {hangGuardMs: 5000})
    } finally {
      client.unsubscribe()
    }
  })

  it('attaching mid-turn hydrates messages from the snapshot and flags generating', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    kit.gate.hold()
    await makeRpcClient(kit.base).chat.send({sessionId, text: 'started elsewhere'})
    const {client, observed} = observeClient(kit.base, sessionId)
    client.subscribe()
    try {
      await until(() => observed.messages.length > 0, {hangGuardMs: 5000})
      expect(observed.messages.some((message) => textOf(message).includes('started elsewhere'))).toBe(true)
      await until(() => observed.generating, {hangGuardMs: 5000})
      kit?.gate.release()
      await until(() => !observed.generating, {hangGuardMs: 5000})
    } finally {
      client.unsubscribe()
    }
  })
})
