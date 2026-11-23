import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import type {ConfigProvider} from 'effect'
import {readOptionalConfig} from '../_shared/optional-config.js'
import {type TextAdapter, codex as codexAdapter} from '@conciv/ai/server'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import type {HarnessLoginStatus} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps, HarnessLogin} from '@conciv/protocol/harness-types'
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

export function codexRunAdapter(deps: HarnessChatDeps, toolCount: number): TextAdapter {
  return codexAdapter(deps.model ?? codexDefaultModel(codexHome(deps.env)), {
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

const NOT_LOGGED_IN = 'Codex is not logged in. Run `codex login` in a terminal.'

const LOGIN_STATUS_TIMEOUT_MS = 30_000

function readLoginStatus(home: string, signal: AbortSignal): Promise<HarnessLoginStatus> {
  const {promise, resolve, reject} = Promise.withResolvers<HarnessLoginStatus>()
  execFile(
    'codex',
    ['login', 'status'],
    {env: {...process.env, CODEX_HOME: home}, signal, timeout: LOGIN_STATUS_TIMEOUT_MS},
    (error, stdout, stderr) => {
      if (error === null) return resolve({loggedIn: true})
      if (`${stdout}${stderr}`.includes('Not logged in')) return resolve({loggedIn: false, message: NOT_LOGGED_IN})
      reject(error)
    },
  )
  return promise
}

function codexLogin(home: string): HarnessLogin {
  const seen = {loggedIn: false}
  return async ({signal}) => {
    if (seen.loggedIn) return {loggedIn: true}
    const status = await readLoginStatus(home, signal)
    seen.loggedIn = status.loggedIn
    return status
  }
}

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
      login: 'probe',
    },
    chatConfig: codexChatConfig,
    login: codexLogin(home),
    models: () => codexModels(home),
    defaultModel: codexDefaultModel(home),
    history: codexHistory(home),
    resume: {command: ({nativeId}) => ({bin: 'codex', args: ['resume', nativeId]})},
  })
}
