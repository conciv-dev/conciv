import {defineChatMiddleware} from '@tanstack/ai'
import {
  defineSandbox,
  defineSandboxPolicy,
  provideSandbox,
  provideSandboxPolicy,
  SandboxCapability,
  type SandboxDefinition,
  type SandboxHandle,
  type SandboxProcess,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'

export function makeConcivSandbox(cwd: string): SandboxDefinition {
  return defineSandbox({
    id: 'conciv',
    provider: localProcessSandbox({dir: cwd}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
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
