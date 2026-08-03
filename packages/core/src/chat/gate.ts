import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineChatMiddleware, type AnyTool, type StreamChunk} from '@tanstack/ai'
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
import {aguiApprovalRequestedFor} from '@conciv/protocol/ui-types'
import {ASK_TIMEOUT_MS, type AskRegistry} from './ask.js'
import {makeToolNameNormalizer} from './tool-names.js'

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

export function riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean {
  return risky.has(makeToolNameNormalizer(risky)(toolName))
}

const BashInputSchema = z.object({command: z.string()})

function needsApproval(toolName: string, toolInput: unknown, risky: ReadonlySet<string>): boolean {
  if (riskyMatches(risky, toolName)) return true
  if (toolName !== 'Bash') return false
  const parsed = BashInputSchema.safeParse(toolInput)
  return classifyCommand(parsed.success ? parsed.data.command : '') !== 'allow'
}

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
}

export type RunGateDeps = {
  sessionId: string
  asks: AskRegistry
  emit: (chunk: StreamChunk) => void
  risky: ReadonlySet<string>
  timeoutMs?: number
}

export function makeRunGate(deps: RunGateDeps): PermissionGate {
  return {
    decide: async (toolName, toolInput, _sessionId, toolUseId) => {
      if (!needsApproval(toolName, toolInput, deps.risky)) return 'allow'
      const approvalId = randomUUID()
      deps.asks.open(deps.sessionId, approvalId)
      deps.emit(aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input: toolInput, approvalId}))
      const approved = await deps.asks.waitFor(deps.sessionId, approvalId, deps.timeoutMs ?? ASK_TIMEOUT_MS)
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

function gatedTools(tools: AnyTool[], gate: PermissionGate, sessionId: string): AnyTool[] {
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
