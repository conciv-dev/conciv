import {expect, onTestFinished} from 'vitest'
import {approvePending} from '@conciv/harness-testkit'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {disposeAll} from './dispose.js'

export type EngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type CreateEngineOptions = {
  plugins?: ConcivConfig['plugins']
  replies?: string[]
  settings?: EngineSetting[]
  files?: Record<string, string>
  permission?: ConcivConfig['permission']
}

export type ToolFailure = {tool: string; message: string}

export type EngineTool = {
  call: (input: unknown) => Promise<unknown>
  failure: (input: unknown) => Promise<ToolFailure>
}

export type EngineSession = {
  id: string
  send: (text: string) => Promise<void>
  approve: () => Promise<void>
  tool: (name: string) => EngineTool
}

export type Engine = {
  session: EngineSession
  newSession: (title?: string) => Promise<EngineSession>
  setting: (setting: EngineSetting) => Promise<void>
}

export type EngineAddress = {apiBase: string; token: string}

export type StartedEngine = {engine: Engine; address: EngineAddress; stop: () => Promise<void>}

const addresses = new WeakMap<Engine, EngineAddress>()
const fileEngines: Array<() => Promise<void>> = []

function failedTool(name: string, call: Promise<unknown>): Promise<ToolFailure> {
  return call.then(
    (output) => {
      throw new Error(`the tool ${name} answered instead of failing: ${JSON.stringify(output)}`)
    },
    (error: unknown) => ({tool: name, message: error instanceof Error ? error.message : String(error)}),
  )
}

function sessionOn(kit: CoreKit, id: string): EngineSession {
  return {
    id,
    send: async (text) => {
      await (await kit.turn(text, {session: id})).done()
    },
    approve: async () => {
      await expect.poll(async () => (await kit.hydrate(id)).pendingApprovals).not.toEqual([])
      await approvePending(kit.base, id)
    },
    tool: (name) => ({
      call: (input) => kit.callTool(name, input, id),
      failure: (input) => failedTool(name, kit.callTool(name, input, id)),
    }),
  }
}

async function newSessionOn(kit: CoreKit, title: string | undefined): Promise<EngineSession> {
  const {sessionId} = await kit.rpc.sessions.create()
  if (title !== undefined) await kit.rpc.sessions.rename({sessionId, title})
  return sessionOn(kit, sessionId)
}

async function seed(kit: CoreKit, options: CreateEngineOptions): Promise<void> {
  for (const text of options.replies ?? []) kit.harness.script.scriptTurn({toolCalls: [], text})
  for (const entry of options.settings ?? []) await kit.rpc.settings.set(entry)
}

export async function startEngine(options: CreateEngineOptions): Promise<StartedEngine> {
  const {plugins, files, permission} = options
  const kit = await bootCoreKit({id: 'engine', plugins, files, permission})
  await seed(kit, options)
  const engine: Engine = {
    session: await newSessionOn(kit, undefined),
    newSession: (title) => newSessionOn(kit, title),
    setting: async (entry) => {
      await kit.rpc.settings.set(entry)
    },
  }
  return {engine, address: {apiBase: kit.base, token: kit.token}, stop: kit.cleanup}
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<Engine> {
  const started = await startEngine(options)
  addresses.set(started.engine, started.address)
  if (expect.getState().currentTestName !== undefined) onTestFinished(started.stop)
  else fileEngines.push(started.stop)
  return started.engine
}

export function engineAddress(engine: Engine): EngineAddress {
  const address = addresses.get(engine)
  if (!address) throw new Error('mount needs an engine made by createEngine from @conciv/plugin-testkit/node')
  return address
}

export function stopFileEngines(): Promise<void> {
  return disposeAll(fileEngines.splice(0), 'sequential', 'an engine made at file level did not stop cleanly')
}
