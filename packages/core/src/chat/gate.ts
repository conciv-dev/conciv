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
import type {AskRegistry} from './ask.js'
import type {CommandMemory} from './command-memory.js'
import {commandSegments, runsAnotherCommand} from './command-grammar.js'
import {ASK_TIMEOUT_MS} from './ask-constants.js'
import {makeToolNameNormalizer} from './tool-names.js'
import type {SessionId} from '@conciv/protocol/chat-types'

const READ_ONLY_COMMANDS = [
  'cd',
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
  const segments = commandSegments(command)
  if (segments === null) return 'ask'
  const policy = commandPolicy(extraAllows)
  const readOnly = segments.every(
    (segment) => !runsAnotherCommand(segment) && evaluateCommand(segment, policy) === 'allow',
  )
  return readOnly ? 'allow' : 'ask'
}

export function riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean {
  return risky.has(makeToolNameNormalizer(risky)(toolName))
}

const BashInputSchema = z.object({command: z.string()})

function bashCommand(toolName: string, toolInput: unknown): string | null {
  if (toolName !== 'Bash') return null
  const parsed = BashInputSchema.safeParse(toolInput)
  return parsed.success ? parsed.data.command : ''
}

function needsApproval(toolName: string, toolInput: unknown, deps: RunGateDeps): boolean {
  if (riskyMatches(deps.risky, toolName)) return true
  const command = bashCommand(toolName, toolInput)
  if (command === null) return false
  if (classifyCommand(command, deps.commandAllows?.() ?? []) === 'allow') return false
  return deps.memory?.allows(command) !== true
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

export function noListenerRefusal(toolName: string, sessionId: SessionId): string {
  return `Tool "${toolName}" requires approval but nothing is attached to session "${sessionId}" to answer; open the widget on that session and retry`
}

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, toolUseId: string): Promise<PermissionDecision>
}

export type BoundAsks = {
  open: (key: string) => void
  waitFor: (key: string, timeoutMs: number) => Promise<unknown>
}

export function asksFor(asks: AskRegistry, sessionId: SessionId): BoundAsks {
  return {
    open: (key) => asks.open(sessionId, key),
    waitFor: (key, timeoutMs) => asks.waitFor(sessionId, key, timeoutMs),
  }
}

export type BoundCommandMemory = {
  note: (approvalId: string, command: string) => void
  settle: (approvalId: string) => void
  allows: (command: string) => boolean
}

export function commandMemoryFor(memory: CommandMemory, sessionId: SessionId): BoundCommandMemory {
  return {
    note: (approvalId, command) => memory.note(sessionId, approvalId, command),
    settle: (approvalId) => memory.settle(sessionId, approvalId),
    allows: (command) => memory.allows(sessionId, command),
  }
}

export type AskGateDeps = {
  asks: BoundAsks
  emit: (chunk: StreamChunk) => void
  timeoutMs?: number
  onAsk?: (approvalId: string) => void
  onAskSettled?: (approvalId: string) => void
}

export type RunGateDeps = AskGateDeps & {
  risky: ReadonlySet<string>
  commandAllows?: () => readonly string[]
  memory?: BoundCommandMemory
}

export function makeAskGate(deps: AskGateDeps): PermissionGate {
  return {
    decide: async (toolName, toolInput, toolUseId) => {
      const approvalId = randomUUID()
      deps.asks.open(approvalId)
      deps.onAsk?.(approvalId)
      deps.emit(aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input: toolInput, approvalId}))
      const approved = await deps.asks.waitFor(approvalId, deps.timeoutMs ?? ASK_TIMEOUT_MS)
      deps.onAskSettled?.(approvalId)
      if (approved === true) return 'allow'
      return approved === false ? 'deny' : 'timeout'
    },
  }
}

export function makeRunGate(deps: RunGateDeps): PermissionGate {
  return {
    decide: async (toolName, toolInput, toolUseId) => {
      if (!needsApproval(toolName, toolInput, deps)) return 'allow'
      const command = bashCommand(toolName, toolInput)
      const ask = makeAskGate({
        ...deps,
        onAsk: (approvalId) => {
          if (command !== null) deps.memory?.note(approvalId, command)
        },
        onAskSettled: (approvalId) => deps.memory?.settle(approvalId),
      })
      return ask.decide(toolName, toolInput, toolUseId)
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

function gatedTools(tools: AnyTool[], gate: PermissionGate): AnyTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context: unknown) => {
        const decision = await gate.decide(tool.name, args, randomUUID())
        const refusal = approvalRefusal(tool.name, decision)
        if (refusal !== null) throw new Error(refusal)
        return execute(args, context)
      },
    }
  })
}

export function gateProvisioner(gate: PermissionGate): ToolBridgeProvisioner {
  return {
    provision: (tools, options) =>
      nodeHttpBridgeProvisioner.provision(gatedTools(tools, gate), {
        ...options,
        permission: options.permission
          ? {
              ...options.permission,
              resolve: async (request) => {
                const {toolName, input, toolUseId} = requestFields(request)
                const decision = await gate.decide(toolName, input, toolUseId)
                return decision === 'allow'
                  ? {behavior: 'allow', updatedInput: input ?? {}}
                  : {behavior: 'deny', message: 'Denied by user'}
              },
            }
          : undefined,
      }),
  }
}

export function withConcivGate(gate: PermissionGate) {
  return defineChatMiddleware({
    name: 'conciv-gate',
    provides: [ToolBridgeProvisionerCapability],
    setup(ctx) {
      provideToolBridgeProvisioner(ctx, gateProvisioner(gate))
    },
  })
}
