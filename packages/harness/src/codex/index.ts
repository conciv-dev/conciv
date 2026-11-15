import {randomUUID} from 'node:crypto'
import {type TextAdapter} from '@conciv/ai/server'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {codexHistory} from './history.js'
import {codexDefaultModel, codexModels} from './models.js'
import {codexRunAdapter} from './run-adapter.js'

const RUN_SCOPED_FIELDS = ['toolCallId', 'messageId', 'parentMessageId'] as const

function runScopedChunk(chunk: ChatEvent, runId: string): ChatEvent {
  const scoped = RUN_SCOPED_FIELDS.flatMap((field) => {
    const value: unknown = Reflect.get(chunk, field)
    return typeof value === 'string' ? [[field, `${runId}:${value}`]] : []
  })
  return scoped.length === 0 ? chunk : {...chunk, ...Object.fromEntries(scoped)}
}

async function* runScopedStream(stream: AsyncIterable<ChatEvent>, runId: string): AsyncIterable<ChatEvent> {
  for await (const chunk of stream) yield runScopedChunk(chunk, runId)
}

function codexTurnAdapter(deps: HarnessChatDeps): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) =>
    runScopedStream(
      codexRunAdapter(deps, options.tools?.length ?? 0).chatStream(options),
      options.runId ?? randomUUID(),
    )
  return new Proxy(codexRunAdapter(deps, 0), {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}

const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexTurnAdapter(deps),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})

export const codex = defineHarness({
  id: 'codex',
  binName: 'codex',
  displayName: 'Codex',
  capabilities: {
    resume: true,
    permissionGate: 'none',
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'http',
    slashCommands: 'none',
    imageInput: false,
    init: 'none',
  },
  chatConfig: codexChatConfig,
  models: () => codexModels(),
  defaultModel: codexDefaultModel(),
  history: codexHistory,
  resume: {command: ({nativeId}) => ({bin: 'codex', args: ['resume', nativeId]})},
})
