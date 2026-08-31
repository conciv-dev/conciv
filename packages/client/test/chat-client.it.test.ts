import {afterEach, describe, expect, it} from 'vitest'
import {ChatClient, type UIMessage} from '@tanstack/ai-client'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

type Observed = {messages: UIMessage[]; generating: boolean}

type ClientUpdate = {kind: 'messages'; messages: UIMessage[]} | {kind: 'generating'; generating: boolean}

function observeClient(
  base: string,
  sessionId: string,
  onUpdate: (update: ClientUpdate) => void,
): {client: ChatClient; observed: Observed} {
  const observed: Observed = {messages: [], generating: false}
  const client = new ChatClient({
    connection: chatConnection(makeRpcClient(base), base, sessionId),
    threadId: sessionId,
    persistence: true,
    onMessagesChange: (messages) => {
      observed.messages = messages
      onUpdate({kind: 'messages', messages})
    },
    onSessionGeneratingChange: (generating) => {
      observed.generating = generating
      onUpdate({kind: 'generating', generating})
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
    const settled = Promise.withResolvers<void>()
    const {client, observed} = observeClient(kit.base, sessionId, (update) => {
      if (update.kind === 'generating' && !update.generating) settled.resolve()
    })
    client.subscribe()
    try {
      await client.sendMessage('hello')
      await settled.promise
      expect(observed.messages[0]?.role).toBe('user')
      expect(
        observed.messages
          .filter((message) => message.role === 'assistant')
          .map(textOf)
          .join(''),
      ).toContain('ok')
    } finally {
      client.unsubscribe()
      client.dispose()
    }
  }, 60_000)

  it('a run whose adapter stream dies after RUN_STARTED still settles generating', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const {client, observed} = observeClient(kit.base, sessionId, () => {})
    client.subscribe()
    try {
      kit.harness.script.scriptError('adapter stream blew up')
      await client.sendMessage('hello')
      expect(observed.generating).toBe(false)
    } finally {
      client.unsubscribe()
      client.dispose()
    }
  }, 60_000)

  it('a client mounting mid-turn hydrates the thread and rejoins the run in flight', async () => {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    clientKit.gate.hold()
    const elsewhere = await clientKit.turn('started elsewhere', {session: sessionId, runId: 'chat-client-1'})
    await elsewhere.waitForRunStart()

    const hydrated = Promise.withResolvers<UIMessage[]>()
    const settled = Promise.withResolvers<void>()
    const {client} = observeClient(clientKit.base, sessionId, (update) => {
      if (update.kind === 'messages' && update.messages.length > 0) hydrated.resolve(update.messages)
      if (update.kind === 'generating' && !update.generating) settled.resolve()
    })
    client.subscribe()
    client.attach()
    try {
      expect((await hydrated.promise).some((message) => textOf(message).includes('started elsewhere'))).toBe(true)
      clientKit.gate.release()
      await settled.promise
    } finally {
      client.unsubscribe()
      client.dispose()
    }
  }, 60_000)
})
