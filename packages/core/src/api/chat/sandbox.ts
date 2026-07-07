import {randomUUID} from 'node:crypto'
import {defineChatMiddleware, type AnyTool} from '@tanstack/ai'
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
import type {PermissionGate} from './permission.js'

type Gate = Pick<PermissionGate, 'decide'>

const sandboxes = new Map<string, SandboxDefinition>()

export function concivSandbox(cwd: string): SandboxDefinition {
  const existing = sandboxes.get(cwd)
  if (existing) return existing
  const definition = defineSandbox({
    id: 'conciv',
    provider: localProcessSandbox({dir: cwd}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  sandboxes.set(cwd, definition)
  return definition
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

function abortSafeProcess(inner: SandboxProcess): SandboxProcess {
  return {
    exec: inner.exec,
    spawn: async (command, options) => {
      const {signal, ...rest} = options ?? {}
      const spawned = await inner.spawn(command, rest)
      void spawned.wait().catch(() => {})
      if (!signal) return spawned
      const killIfLive = () => {
        if (spawned.pid > 0) void spawned.kill()
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
