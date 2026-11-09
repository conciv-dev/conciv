import {randomUUID} from 'node:crypto'
import {codex as codexAdapter, type TextAdapter} from '@conciv/ai/server'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {definedEntries} from '../_shared/env.js'
import {codexHistory} from './history.js'
import {codexDefaultModel, codexHome, codexModels} from './models.js'

const BRIDGED_MCP_SERVER_NAME = 'tanstack'

const bridgeApproveConfig = {[`mcp_servers.${BRIDGED_MCP_SERVER_NAME}.default_tools_approval_mode`]: '"approve"'}

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

function effortConfig(level: string | undefined): Record<string, string> {
  return level === undefined || level === 'off' ? {} : {model_reasoning_effort: `"${level}"`}
}

function codexRunAdapter(deps: HarnessChatDeps, level?: string): TextAdapter {
  return codexAdapter(deps.model ?? codexDefaultModel(codexHome(deps.env)), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    config: {...(deps.hasTools ? bridgeApproveConfig : {}), ...effortConfig(level)},
    env: definedEntries(deps.env),
  })
}

function codexTurnAdapter(deps: HarnessChatDeps): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) =>
    runScopedStream(codexRunAdapter(deps, options.reasoning?.level).chatStream(options), options.runId ?? randomUUID())
  return new Proxy(codexRunAdapter(deps), {
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
