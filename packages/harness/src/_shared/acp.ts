import {acp} from '@conciv/ai/server'
import type {HarnessChatDeps, HarnessPermissionVerdict} from '@conciv/protocol/harness-types'
import type {HarnessChatConfig} from './contract.js'

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

export function acpChatConfig(name: string, resolveCommand: (model: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps): HarnessChatConfig => ({
    adapter: acp(deps.model ?? defaultModel, {
      name,
      command: ({model}) => resolveCommand(model),
      onPermissionRequest: askPermission(deps),
    }),
    modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
  })
}
