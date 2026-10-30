import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {type ChatEvent, approvalRequestedEvent, approvalSettledEvent} from '@conciv/ai'
import {
  decideCommand,
  defineCommandPolicy,
  toolGateMiddleware,
  toolGateProvisioner,
  withRunMetadata,
  type CommandDecision,
  type ToolProvisioner,
  type TurnMiddleware,
} from '@conciv/ai/server'
import type {AskRegistry, PendingApproval} from './ask.js'
import type {CommandMemory} from './command-memory.js'
import {commandSegments, escapesReadOnlyIntent} from './command-grammar.js'
import {ASK_TIMEOUT_MS} from './ask-constants.js'
import {makeToolNameNormalizer} from './tool-names.js'
import type {SessionId} from '@conciv/protocol/chat-types'

const SHELL_METACHARACTER_PATTERNS = ['*;*', '*&*', '*|*', '*`*', '*$*', '*>*', '*<*']

function commandPolicy(allows: readonly string[]) {
  return defineCommandPolicy({default: 'ask', ask: SHELL_METACHARACTER_PATTERNS, allow: allows})
}

export function classifyCommand(command: string, allows: readonly string[] = []): CommandDecision {
  const segments = commandSegments(command)
  if (segments === null) return 'ask'
  const policy = commandPolicy(allows)
  const readOnly = segments.every(
    (segment) => !escapesReadOnlyIntent(segment) && decideCommand(segment, policy) === 'allow',
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
  open: (key: string, approval?: PendingApproval) => void
  waitFor: (key: string, timeoutMs: number) => Promise<unknown>
}

export function asksFor(asks: AskRegistry, sessionId: SessionId): BoundAsks {
  return {
    open: (key, approval) => asks.open(sessionId, key, approval),
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
  emit: (chunk: ChatEvent) => void
  timeoutMs?: number
  onAsk?: (approvalId: string) => void
  onAskSettled?: (approvalId: string) => void
  threadId?: string
  runId?: string
}

export function approvalRequestedChunk(input: {
  toolCallId: string
  toolName: string
  input: unknown
  approvalId: string
  threadId?: string
  runId?: string
}): ChatEvent {
  const event = approvalRequestedEvent.create({
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    input: input.input,
    approval: {id: input.approvalId, needsApproval: true},
  })
  if (input.threadId === undefined || input.runId === undefined) return event
  return withRunMetadata(event, {threadId: input.threadId, runId: input.runId})
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
      deps.asks.open(approvalId, {
        approvalId,
        toolCallId: toolUseId,
        toolName,
        input: toolInput,
        runId: deps.runId ?? null,
      })
      deps.onAsk?.(approvalId)
      deps.emit(
        approvalRequestedChunk({
          toolCallId: toolUseId,
          toolName,
          input: toolInput,
          approvalId,
          threadId: deps.threadId,
          runId: deps.runId,
        }),
      )
      const approved = await deps.asks.waitFor(approvalId, deps.timeoutMs ?? ASK_TIMEOUT_MS)
      deps.onAskSettled?.(approvalId)
      deps.emit(approvalSettledEvent.create({approvalId: approvalId}))
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

export function gateProvisioner(gate: PermissionGate): ToolProvisioner {
  return toolGateProvisioner(async (toolName, input, toolUseId) =>
    approvalRefusal(toolName, await gate.decide(toolName, input, toolUseId)),
  )
}

export function withConcivGate(gate: PermissionGate): TurnMiddleware {
  return toolGateMiddleware('conciv-gate', gateProvisioner(gate))
}
