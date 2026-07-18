import {afterEach, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
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

function observeClient(
  kitBase: string,
  sessionId: string,
  connectionOptions: Parameters<typeof chatConnection>[2] = {},
  connection = chatConnection(makeRpcClient(kitBase), sessionId, connectionOptions),
): {client: ChatClient; observed: Observed} {
  const observed: Observed = {messages: [], generating: false, connectionStatus: 'disconnected'}
  const client = new ChatClient({
    connection,
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

  it('does not settle a local send from another surface terminal event after BUSY', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const startSeen = Promise.withResolvers<void>()
    const releaseStart = Promise.withResolvers<void>()
    let retries = 0
    const baseConnection = chatConnection(rpc, sessionId, {
      retryDelayMs: 500,
      onRetry: () => {
        retries += 1
        releaseStart.resolve()
      },
    })
    const connection: ReturnType<typeof chatConnection> = {
      subscribe: async function* (signal) {
        let heldStart = false
        for await (const chunk of baseConnection.subscribe(signal)) {
          if (!heldStart && chunk.type === EventType.RUN_STARTED) {
            heldStart = true
            startSeen.resolve()
            await releaseStart.promise
            continue
          }
          yield chunk
        }
      },
      send: baseConnection.send,
    }
    const {client, observed} = observeClient(kit.base, sessionId, {}, connection)
    client.subscribe()
    try {
      await until(() => observed.connectionStatus === 'connected', {hangGuardMs: 5000})
      kit.gate.hold()
      await rpc.chat.send({sessionId, text: 'started elsewhere'})
      await startSeen.promise
      let localSettled = false
      const localSend = client.sendMessage('sent locally').then((result) => {
        localSettled = true
        return result
      })
      await until(() => retries > 0, {hangGuardMs: 5000})
      kit.gate.release()
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(localSettled).toBe(false)
      expect(kit.harness.__turnMessages).toHaveLength(1)
      await localSend
      await until(() => kit?.harness.__turnMessages.length === 2, {hangGuardMs: 5000})
      await until(() => !observed.generating, {hangGuardMs: 5000})
      expect(observed.messages.some((message) => message.role === 'assistant' && textOf(message).includes('ok'))).toBe(
        true,
      )
      expect(observed.messages.some((message) => message.role === 'user' && textOf(message) === 'sent locally')).toBe(
        true,
      )
    } finally {
      client.unsubscribe()
    }
  })
})
