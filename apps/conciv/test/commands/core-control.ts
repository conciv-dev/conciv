import {join} from 'node:path'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import type {EngineStaleness} from '@conciv/contract'
import type {HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'

export type BootCoreInput = {
  id: string
  text?: string
  history?: HarnessSessionMeta[]
  allowedOrigins?: string[]
}

export type BootCoreResult = {base: string; wsBase: string; bootMs: number}

export type FaultSpec = {kind: 'fail'; path: string[]; status?: number} | {kind: 'gate'; path?: string[]}

type Fault = {pending: () => number; release: () => Promise<void>; dispose: () => Promise<void>}

type CoreTestkit = typeof import('./core-testkit.js')

type FileState = {
  kit: CoreKit | null
  staleness: {value: EngineStaleness}
  faults: Map<string, Fault>
  handles: {count: number}
}

const FRESH: EngineStaleness = {
  stale: false,
  changed: [],
  tracked: ['@conciv/core'],
  bootedAt: 0,
  fingerprint: 'testkit0000',
}

const files = new Map<string, FileState>()

function testkitOf(ctx: BrowserCommandContext): Promise<CoreTestkit> {
  const nodeProject = ctx.project.vitest.getRootProject()
  return nodeProject.import<CoreTestkit>(join(ctx.project.config.root, 'test/commands/core-testkit.ts'))
}

function stateOf(ctx: BrowserCommandContext): FileState {
  const key = ctx.testPath ?? 'shared'
  const existing = files.get(key)
  if (existing) return existing
  const created: FileState = {kit: null, staleness: {value: FRESH}, faults: new Map(), handles: {count: 0}}
  files.set(key, created)
  return created
}

function kitOf(ctx: BrowserCommandContext): CoreKit {
  const kit = stateOf(ctx).kit
  if (!kit) throw new Error('no core is booted for this test file; call bootCore first')
  return kit
}

function faultOf(ctx: BrowserCommandContext, handle: string): Fault {
  const fault = stateOf(ctx).faults.get(handle)
  if (!fault) throw new Error(`no fault is installed under the handle "${handle}"`)
  return fault
}

const bootCore: BrowserCommand<[BootCoreInput]> = async (ctx, input): Promise<BootCoreResult> => {
  const state = stateOf(ctx)
  if (state.kit) throw new Error('a core is already booted for this test file; call closeCore first')
  const startedAt = Date.now()
  const {bootCoreKit} = await testkitOf(ctx)
  const kit = await bootCoreKit({
    id: input.id,
    text: input.text,
    history: input.history,
    allowedOrigins: input.allowedOrigins,
    staleness: () => state.staleness.value,
  })
  state.kit = kit
  return {base: kit.base, wsBase: kit.wsBase, bootMs: Date.now() - startedAt}
}

const closeCore: BrowserCommand<[]> = async (ctx): Promise<void> => {
  const state = stateOf(ctx)
  for (const fault of state.faults.values()) await fault.dispose()
  state.faults.clear()
  state.staleness.value = FRESH
  const kit = state.kit
  state.kit = null
  if (!kit) return
  kit.harness.script.release()
  await kit.cleanup()
}

const setStaleness: BrowserCommand<[EngineStaleness]> = (ctx, value): void => {
  stateOf(ctx).staleness.value = value
}

const holdTurn: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.hold()
}

const releaseTurn: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.release()
}

const scriptError: BrowserCommand<[string]> = (ctx, message): void => {
  kitOf(ctx).harness.script.scriptError(message)
}

const scriptTurn: BrowserCommand<[ScriptedTurn]> = (ctx, turn): string[] => kitOf(ctx).harness.script.scriptTurn(turn)

const installFault: BrowserCommand<[FaultSpec]> = async (ctx, spec): Promise<string> => {
  const state = stateOf(ctx)
  const {failRpcCalls, gateRpcCalls} = await testkitOf(ctx)
  state.handles.count += 1
  const handle = `fault-${state.handles.count}`
  if (spec.kind === 'gate') {
    state.faults.set(handle, await gateRpcCalls(ctx.page, spec.path ? {path: spec.path} : {}))
    return handle
  }
  const injector = await failRpcCalls(ctx.page, {path: spec.path, ...(spec.status ? {status: spec.status} : {})})
  state.faults.set(handle, {
    pending: () => 0,
    release: () => {
      injector.repair()
      return Promise.resolve()
    },
    dispose: injector.dispose,
  })
  return handle
}

const releaseFault: BrowserCommand<[string]> = async (ctx, handle): Promise<void> => {
  await faultOf(ctx, handle).release()
}

const faultPending: BrowserCommand<[string]> = (ctx, handle): number => faultOf(ctx, handle).pending()

export const coreCommands = {
  bootCore,
  closeCore,
  setStaleness,
  holdTurn,
  releaseTurn,
  scriptError,
  scriptTurn,
  installFault,
  releaseFault,
  faultPending,
}
