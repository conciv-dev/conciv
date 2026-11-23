import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {acp} from '@conciv/ai/server'
import type {HarnessChatDeps, HarnessPermissionVerdict} from '@conciv/protocol/harness-types'

type AcpPermissionOption = {optionId: string; name: string; kind: string}

type AcpPermissionRequest = {
  toolCall: {toolCallId: string; title?: string | null; kind?: string | null; rawInput?: unknown}
  options: AcpPermissionOption[]
}

type AcpPermissionOutcome = {outcome: 'cancelled'} | {outcome: 'selected'; optionId: string}

const BRIDGED_SERVER = 'tanstack'

const ALLOW_KINDS = ['allow_once', 'allow_always']

const REJECT_KINDS = ['reject_once', 'reject_always']

function pickOption(options: AcpPermissionOption[], kinds: readonly string[]): AcpPermissionOutcome {
  const option = kinds.flatMap((kind) => options.filter((candidate) => candidate.kind === kind))[0]
  return option === undefined ? {outcome: 'cancelled'} : {outcome: 'selected', optionId: option.optionId}
}

function isBridgedCall(request: AcpPermissionRequest): boolean {
  const title = request.toolCall.title ?? ''
  return (
    title.endsWith(`(${BRIDGED_SERVER} MCP Server)`) ||
    request.options.some((option) => option.name === `Always Allow ${BRIDGED_SERVER}`)
  )
}

function readRawInput(rawInput: unknown): Record<string, unknown> {
  return typeof rawInput === 'object' && rawInput !== null ? {...rawInput} : {}
}

function answerOption(options: AcpPermissionOption[], verdict: HarnessPermissionVerdict): AcpPermissionOutcome {
  return pickOption(options, verdict.allowed ? ALLOW_KINDS : REJECT_KINDS)
}

function askPermission(deps: HarnessChatDeps) {
  return async (request: AcpPermissionRequest): Promise<AcpPermissionOutcome> => {
    if (isBridgedCall(request)) return pickOption(request.options, ALLOW_KINDS)
    const verdict = await deps.askPermission({
      action: request.toolCall.kind ?? 'tool',
      resources: [request.toolCall.title ?? request.toolCall.toolCallId],
      metadata: readRawInput(request.toolCall.rawInput),
    })
    return answerOption(request.options, verdict)
  }
}

function acpChatConfig(name: string, resolveCommand: (model: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps): HarnessChatConfig => ({
    adapter: acp(deps.model ?? defaultModel, {
      name,
      command: ({model}) => resolveCommand(model),
      onPermissionRequest: askPermission(deps),
    }),
    modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
  })
}

const GEMINI_MODELS = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash']

export const geminiCli = defineHarness({
  id: 'gemini-cli',
  binName: 'gemini',
  displayName: 'Gemini CLI',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
    init: 'none',
    login: 'none',
  },
  chatConfig: acpChatConfig('gemini-cli', (model) => `gemini --acp -m ${model}`, 'gemini-3-pro-preview'),
  models: GEMINI_MODELS.map((id) => ({id, name: id, group: 'Gemini'})),
  defaultModel: 'gemini-3-pro-preview',
})
