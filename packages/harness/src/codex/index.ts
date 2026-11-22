import {randomUUID} from 'node:crypto'
import type {ConfigProvider} from 'effect'
import {readOptionalConfig} from '../_shared/optional-config.js'
import {type TextAdapter, codex as codexAdapter} from '@conciv/ai/server'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {codexHistory} from './history.js'
import {codexDefaultModel, codexModels, codexHome} from './models.js'
import {definedEntries} from '../_shared/env.js'

const TANSTACK_MCP_SERVER_NAME = 'tanstack'

const approveTanstackToolsConfig = {
  [`mcp_servers.${TANSTACK_MCP_SERVER_NAME}.default_tools_approval_mode`]: '"approve"',
}

function effortConfig(effort: string | undefined): Record<string, string> {
  return effort === undefined ? {} : {model_reasoning_effort: `"${effort}"`}
}

export function codexRunAdapter(deps: HarnessChatDeps, model: string, toolCount: number): TextAdapter {
  return codexAdapter(model, {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    config: {...(toolCount > 0 ? approveTanstackToolsConfig : {}), ...effortConfig(deps.effort)},
    env: definedEntries(deps.env),
  })
}

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

function codexTurnAdapter(deps: HarnessChatDeps, model: string): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) =>
    runScopedStream(
      codexRunAdapter(deps, model, options.tools?.length ?? 0).chatStream(options),
      options.runId ?? randomUUID(),
    )
  return new Proxy(codexRunAdapter(deps, model, 0), {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}

const codexChatConfig = async (deps: HarnessChatDeps): Promise<HarnessChatConfig> => ({
  adapter: codexTurnAdapter(deps, deps.model ?? (await codexDefaultModel(codexHome(deps.env)))),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})

export function codex(provider: ConfigProvider.ConfigProvider) {
  const home = codexHome({CODEX_HOME: readOptionalConfig(provider, 'CODEX_HOME')})
  return defineHarness({
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
    models: () => codexModels(home),
    defaultModel: () => codexDefaultModel(home),
    history: codexHistory(home),
    resume: {command: ({nativeId}) => ({bin: 'codex', args: ['resume', nativeId]})},
  })
}
