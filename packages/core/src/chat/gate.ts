import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineChatMiddleware, EventType, type AnyTool, type StreamProcessor} from '@tanstack/ai'
import {
  defineSandbox,
  defineSandboxPolicy,
  nodeHttpBridgeProvisioner,
  provideSandbox,
  provideSandboxPolicy,
  provideToolBridgeProvisioner,
  SandboxCapability,
  ToolBridgeProvisionerCapability,
  type SandboxDefinition,
  type SandboxHandle,
  type SandboxProcess,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import {aguiApprovalRequestedFor, UiAnswerValueSchema, type UiAnswer} from '@conciv/protocol/ui-types'
import {replyFor, runMessagesFor, runSessions, type ConcivDb} from '@conciv/db'
import {nextChange, type Changes} from './attach.js'

export type CommandPolicy = 'allow' | 'ask'

const READ_ONLY = new Set([
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
])

const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'branch'])

export function classifyCommand(command: string): CommandPolicy {
  const c = command.trim()
  if (c === '') return 'ask'

  if (/[;&|`$><\n]/.test(c)) return 'ask'
  if (c.startsWith('conciv tools')) return 'allow'
  const tokens = c.split(/\s+/)
  if (tokens[0] === 'git') return GIT_READ_ONLY.has(tokens[1] ?? '') ? 'allow' : 'ask'
  return READ_ONLY.has(tokens[0] ?? '') ? 'allow' : 'ask'
}

export const UI_ASK_TIMEOUT_MS = 120_000
export const PART_WAIT_TIMEOUT_MS = 5_000

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

export type WaitDeps = {db: ConcivDb; changes: Changes}

export function awaitReply(deps: WaitDeps, sessionId: string, key: string, timeoutMs: number): Promise<unknown | null> {
  const existing = replyFor(deps.db, sessionId, key)
  if (existing !== null) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const settle = (value: unknown | null): void => {
      clearTimeout(timer)
      deps.changes.emitter.off('change', check)
      resolve(value)
    }
    const check = (): void => {
      const value = replyFor(deps.db, sessionId, key)
      if (value !== null) settle(value)
    }
    const timer = setTimeout(() => settle(null), timeoutMs)
    deps.changes.emitter.on('change', check)
  })
}

const MessagePartsSchema = z.object({parts: z.array(z.unknown())}).loose()
const ToolCallPartSchema = z.object({type: z.literal('tool-call'), id: z.string(), name: z.string()}).loose()

export function toolCallParts(messages: unknown[]): {id: string; name: string}[] {
  return messages.flatMap((message) => {
    const parsed = MessagePartsSchema.safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const parsedPart = ToolCallPartSchema.safeParse(part)
      return parsedPart.success ? [{id: parsedPart.data.id, name: parsedPart.data.name}] : []
    })
  })
}

export function pendingUiCallIds(db: ConcivDb, sessionId: string): string[] {
  const row = runMessagesFor(db, sessionId)
  if (!row) return []
  return toolCallParts(row.messages)
    .filter((part) => part.name === 'conciv_ui')
    .map((part) => part.id)
    .filter((id) => replyFor(db, sessionId, id) === null)
}

const ApprovalPartSchema = z
  .object({type: z.literal('tool-call'), approval: z.object({id: z.string()}).loose()})
  .loose()

function approvalIdsOf(messages: unknown[]): string[] {
  return messages.flatMap((message) => {
    const parsed = MessagePartsSchema.safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const parsedPart = ApprovalPartSchema.safeParse(part)
      return parsedPart.success ? [parsedPart.data.approval.id] : []
    })
  })
}

export function sessionForApproval(db: ConcivDb, approvalId: string): string | null {
  for (const sessionId of runSessions(db)) {
    const row = runMessagesFor(db, sessionId)
    if (row && approvalIdsOf(row.messages).includes(approvalId)) return sessionId
  }
  return null
}

async function waitForUiCall(deps: WaitDeps, sessionId: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  const abort = new AbortController()
  try {
    while (Date.now() < deadline) {
      const pending = pendingUiCallIds(deps.db, sessionId)
      const newest = pending.at(-1)
      if (newest !== undefined) return newest
      await Promise.race([
        nextChange(deps.changes, abort.signal),
        new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now()))),
      ])
    }
    return null
  } finally {
    abort.abort()
  }
}

export async function askUi(deps: WaitDeps, sessionId: string): Promise<UiAnswer> {
  const callId = await waitForUiCall(deps, sessionId, PART_WAIT_TIMEOUT_MS)
  if (callId === null) return UNANSWERED
  const value = await awaitReply(deps, sessionId, callId, UI_ASK_TIMEOUT_MS)
  const parsed = UiAnswerValueSchema.safeParse(value)
  return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
}

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
}

type Gate = Pick<PermissionGate, 'decide'>

const APPROVAL_TIMEOUT_MS = 120_000

const BashInputSchema = z.object({command: z.string()})

const MCP_PREFIX = /^mcp__[a-z0-9-]+__/i

export function riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean {
  return risky.has(toolName.replace(MCP_PREFIX, ''))
}

function needsApproval(toolName: string, toolInput: unknown, risky: ReadonlySet<string>): boolean {
  if (riskyMatches(risky, toolName)) return true
  if (toolName !== 'Bash') return false
  const parsed = BashInputSchema.safeParse(toolInput)
  return classifyCommand(parsed.success ? parsed.data.command : '') !== 'allow'
}

export type RunGateDeps = {
  sessionId: string
  processor: StreamProcessor
  db: ConcivDb
  changes: Changes
  risky: ReadonlySet<string>
  timeoutMs?: number
  partWaitMs?: number
}

async function ensureToolCallPart(deps: RunGateDeps, toolName: string, toolUseId: string): Promise<void> {
  const deadline = Date.now() + (deps.partWaitMs ?? PART_WAIT_TIMEOUT_MS)
  const abort = new AbortController()
  const folded = () => toolCallParts(deps.processor.getMessages()).some((part) => part.id === toolUseId)
  try {
    while (!folded() && Date.now() < deadline) {
      await Promise.race([
        nextChange(deps.changes, abort.signal),
        new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now()))),
      ])
    }
  } finally {
    abort.abort()
  }
  if (folded()) return
  deps.processor.processChunk({
    type: EventType.TOOL_CALL_START,
    toolCallId: toolUseId,
    toolCallName: toolName,
    toolName,
  })
  deps.processor.processChunk({type: EventType.TOOL_CALL_END, toolCallId: toolUseId})
}

export function makeRunGate(deps: RunGateDeps): PermissionGate {
  return {
    decide: async (toolName, toolInput, _sessionId, toolUseId) => {
      if (!needsApproval(toolName, toolInput, deps.risky)) return 'allow'
      const approvalId = randomUUID()
      await ensureToolCallPart(deps, toolName, toolUseId)
      deps.processor.processChunk(
        aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input: toolInput, approvalId}),
      )
      const approved = await awaitReply(
        {db: deps.db, changes: deps.changes},
        deps.sessionId,
        approvalId,
        deps.timeoutMs ?? APPROVAL_TIMEOUT_MS,
      )
      return approved === true ? 'allow' : 'deny'
    },
  }
}

export function makeConcivSandbox(cwd: string): SandboxDefinition {
  return defineSandbox({
    id: 'conciv',
    provider: localProcessSandbox({dir: cwd}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
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

function gatedTools(tools: AnyTool[], gate: Gate, sessionId: string): AnyTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context: unknown) => {
        const decision = await gate.decide(tool.name, args, sessionId, randomUUID())
        if (decision === 'deny') throw new Error(`Tool "${tool.name}" was denied by the user`)
        return execute(args, context)
      },
    }
  })
}

export function gateProvisioner(gate: Gate, sessionId: string): ToolBridgeProvisioner {
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

export function withConcivGate(gate: Gate, sessionId: string) {
  return defineChatMiddleware({
    name: 'conciv-gate',
    provides: [ToolBridgeProvisionerCapability],
    setup(ctx) {
      provideToolBridgeProvisioner(ctx, gateProvisioner(gate, sessionId))
    },
  })
}

const SIGKILL_ESCALATION_MS = 2000

function abortSafeProcess(inner: SandboxProcess): SandboxProcess {
  return {
    exec: inner.exec,
    spawn: async (command, options) => {
      const {signal, ...rest} = options ?? {}
      const spawned = await inner.spawn(command, rest)
      const live = {value: true}
      const settle = () => {
        live.value = false
      }
      void spawned.wait().then(settle, settle)
      if (!signal) return spawned
      const killIfLive = () => {
        if (spawned.pid <= 0 || !live.value) return
        void spawned.kill()
        const escalate = setTimeout(() => {
          if (live.value) void spawned.kill('SIGKILL')
        }, SIGKILL_ESCALATION_MS)
        escalate.unref?.()
      }
      if (!signal.aborted) {
        signal.addEventListener('abort', killIfLive, {once: true})
        return spawned
      }
      killIfLive()
      return {...spawned, stdin: {write: () => Promise.resolve(), end: () => Promise.resolve()}}
    },
  }
}

function abortSafeHandle(handle: SandboxHandle): SandboxHandle {
  return {
    id: handle.id,
    provider: handle.provider,
    capabilities: handle.capabilities,
    fs: handle.fs,
    git: handle.git,
    process: abortSafeProcess(handle.process),
    ports: handle.ports,
    env: handle.env,
    destroy: () => handle.destroy(),
    ...(handle.workspaceRoot !== undefined ? {workspaceRoot: handle.workspaceRoot} : {}),
    ...(handle.snapshot ? {snapshot: handle.snapshot} : {}),
    ...(handle.fork ? {fork: handle.fork} : {}),
  }
}

export function withConcivSandbox(definition: SandboxDefinition) {
  return defineChatMiddleware({
    name: 'conciv-sandbox',
    provides: [SandboxCapability],
    async setup(ctx) {
      const handle = await definition.ensure({threadId: ctx.threadId, runId: ctx.runId, signal: ctx.signal})
      provideSandbox(ctx, abortSafeHandle(handle))
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)
    },
  })
}
