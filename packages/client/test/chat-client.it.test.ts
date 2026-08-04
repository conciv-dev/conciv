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

type Observed = {
  messages: UIMessage[]
  generating: boolean
  connectionStatus: string
}

type ClientUpdate =
  | {kind: 'messages'; messages: UIMessage[]}
  | {kind: 'generating'; generating: boolean}
  | {kind: 'connection'; status: string}

type ObserveOpts = {
  onUpdate: (update: ClientUpdate) => void
  connectionOptions?: Parameters<typeof chatConnection>[2]
  connection?: ReturnType<typeof chatConnection>
}

function observeClient(
  kitBase: string,
  sessionId: string,
  opts: ObserveOpts,
): {client: ChatClient; observed: Observed} {
  const observed: Observed = {messages: [], generating: false, connectionStatus: 'disconnected'}
  const connection = opts.connection ?? chatConnection(makeRpcClient(kitBase), sessionId, opts.connectionOptions ?? {})
  const client = new ChatClient({
    connection,
    onMessagesChange: (messages) => {
      observed.messages = messages
      opts.onUpdate({kind: 'messages', messages})
    },
    onSessionGeneratingChange: (isGenerating) => {
      observed.generating = isGenerating
      opts.onUpdate({kind: 'generating', generating: isGenerating})
    },
    onConnectionStatusChange: (status) => {
      observed.connectionStatus = status
      opts.onUpdate({kind: 'connection', status})
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
    const connected = Promise.withResolvers<void>()
    const settled = Promise.withResolvers<void>()
    const {client, observed} = observeClient(kit.base, sessionId, {
      onUpdate: (update) => {
        if (update.kind === 'connection' && update.status === 'connected') connected.resolve()
        if (update.kind === 'generating' && !update.generating) settled.resolve()
      },
    })
    client.subscribe()
    try {
      await connected.promise
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
    }
  })

  it('a run whose adapter stream dies after RUN_STARTED still settles generating', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const connected = Promise.withResolvers<void>()
    const {client, observed} = observeClient(kit.base, sessionId, {
      onUpdate: (update) => {
        if (update.kind === 'connection' && update.status === 'connected') connected.resolve()
      },
    })
    client.subscribe()
    try {
      await connected.promise
      kit.harness.script.scriptError('adapter stream blew up')
      await client.sendMessage('hello')
      expect(observed.generating).toBe(false)
    } finally {
      client.unsubscribe()
    }
  })

  it('attaching mid-turn hydrates messages from the snapshot and flags generating', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    kit.gate.hold()
    await makeRpcClient(kit.base).chat.send({sessionId, runId: 'chat-client-1', text: 'started elsewhere'})
    const hydrated = Promise.withResolvers<UIMessage[]>()
    const running = Promise.withResolvers<void>()
    const settled = Promise.withResolvers<void>()
    const {client} = observeClient(kit.base, sessionId, {
      onUpdate: (update) => {
        if (update.kind === 'messages') hydrated.resolve(update.messages)
        if (update.kind === 'generating' && update.generating) running.resolve()
        if (update.kind === 'generating' && !update.generating) settled.resolve()
      },
    })
    client.subscribe()
    try {
      expect((await hydrated.promise).some((message) => textOf(message).includes('started elsewhere'))).toBe(true)
      await running.promise
      kit?.gate.release()
      await settled.promise
    } finally {
      client.unsubscribe()
    }
  })
})
