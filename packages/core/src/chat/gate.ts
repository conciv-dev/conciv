import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineChatMiddleware, type AnyTool, type StreamChunk} from '@tanstack/ai'
import {
  defineSandboxPolicy,
  evaluateCommand,
  nodeHttpBridgeProvisioner,
  provideToolBridgeProvisioner,
  ToolBridgeProvisionerCapability,
  type PolicyDecision,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {aguiApprovalRequestedFor} from '@conciv/protocol/ui-types'
import {ASK_TIMEOUT_MS, type AskRegistry} from './ask.js'
import {makeToolNameNormalizer} from './tool-names.js'

const READ_ONLY_COMMANDS = [
  'ls',
  'cat',
  'pwd',
  'echo',
  'head',
  'tail',
  'grep',
  'rg',
  'find',
  'which',
  'wc',
  'env',
  'date',
  'true',
]

const GIT_READ_ONLY_SUBCOMMANDS = ['status', 'diff', 'log', 'show', 'branch']

const SHELL_METACHARACTER_PATTERNS = ['*;*', '*&*', '*|*', '*`*', '*$*', '*>*', '*<*']

function commandPolicy(extraAllows: readonly string[]) {
  return defineSandboxPolicy({
    default: 'ask',
    commands: {
      ask: SHELL_METACHARACTER_PATTERNS,
      allow: [
        ...READ_ONLY_COMMANDS.flatMap((command) => [command, `${command} *`]),
        ...GIT_READ_ONLY_SUBCOMMANDS.flatMap((subcommand) => [`git ${subcommand}`, `git ${subcommand} *`]),
        ...extraAllows,
      ],
    },
  })
}

export function classifyCommand(command: string, extraAllows: readonly string[] = []): PolicyDecision {
  return evaluateCommand(command, commandPolicy(extraAllows))
}

export function riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean {
  return risky.has(makeToolNameNormalizer(risky)(toolName))
}

const BashInputSchema = z.object({command: z.string()})

function needsApproval(toolName: string, toolInput: unknown, deps: RunGateDeps): boolean {
  if (riskyMatches(deps.risky, toolName)) return true
  if (toolName !== 'Bash') return false
  const parsed = BashInputSchema.safeParse(toolInput)
  return classifyCommand(parsed.success ? parsed.data.command : '', deps.commandAllows?.() ?? []) !== 'allow'
}

export function requiresApproval(subject: {approval?: 'ask'}): boolean {
  return subject.approval === 'ask'
}

export type PermissionDecision = 'allow' | 'deny' | 'timeout'

export function approvalRefusal(toolName: string, decision: PermissionDecision): string | null {
  if (decision === 'allow') return null
  if (decision === 'deny') return `Tool "${toolName}" was denied by the user`
  return `Tool "${toolName}" received no approval decision (the ask timed out)`
}

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<PermissionDecision>
}

export type AskGateDeps = {
  sessionId: string
  asks: AskRegistry
  emit: (chunk: StreamChunk) => void
  timeoutMs?: number
}

export type RunGateDeps = AskGateDeps & {
  risky: ReadonlySet<string>
  commandAllows?: () => readonly string[]
}

export function makeAskGate(deps: AskGateDeps): PermissionGate {
  return {
    decide: async (toolName, toolInput, _sessionId, toolUseId) => {
      if (!deps.sessionId) return 'deny'
      const approvalId = randomUUID()
      deps.asks.open(deps.sessionId, approvalId)
      deps.emit(aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input: toolInput, approvalId}))
      const approved = await deps.asks.waitFor(deps.sessionId, approvalId, deps.timeoutMs ?? ASK_TIMEOUT_MS)
      if (approved === true) return 'allow'
      return approved === false ? 'deny' : 'timeout'
    },
  }
}

export function makeRunGate(deps: RunGateDeps): PermissionGate {
  const ask = makeAskGate(deps)
  return {
    decide: async (toolName, toolInput, sessionId, toolUseId) => {
      if (!needsApproval(toolName, toolInput, deps)) return 'allow'
      return ask.decide(toolName, toolInput, sessionId, toolUseId)
    },
  }
}

function requestFields(request: {tool_name?: string; input?: unknown}): {
  toolName: string
  input: unknown
  toolUseId: string
} {
  const record: Record<string, unknown> = {...request}
  return {
    toolName: typeof record.tool_name === 'string' ? record.tool_name : 'tool',
    input: record.input,
    toolUseId: typeof record.tool_use_id === 'string' ? record.tool_use_id : randomUUID(),
  }
}

function gatedTools(tools: AnyTool[], gate: PermissionGate, sessionId: string): AnyTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context: unknown) => {
        const decision = await gate.decide(tool.name, args, sessionId, randomUUID())
        const refusal = approvalRefusal(tool.name, decision)
        if (refusal !== null) throw new Error(refusal)
        return execute(args, context)
      },
    }
  })
}

export function gateProvisioner(gate: PermissionGate, sessionId: string): ToolBridgeProvisioner {
  return {
    provision: (tools, options) =>
      nodeHttpBridgeProvisioner.provision(gatedTools(tools, gate, sessionId), {
        ...options,
        permission: options.permission
          ? {
              ...options.permission,
              resolve: async (request) => {
                const {toolName, input, toolUseId} = requestFields(request)
                const decision = await gate.decide(toolName, input, sessionId, toolUseId)
                return decision === 'allow'
                  ? {behavior: 'allow', updatedInput: input ?? {}}
                  : {behavior: 'deny', message: 'Denied by user'}
              },
            }
          : undefined,
      }),
  }
}

export function withConcivGate(gate: PermissionGate, sessionId: string) {
  return defineChatMiddleware({
    name: 'conciv-gate',
    provides: [ToolBridgeProvisionerCapability],
    setup(ctx) {
      provideToolBridgeProvisioner(ctx, gateProvisioner(gate, sessionId))
    },
  })
}
