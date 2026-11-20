import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'es-toolkit'
import pTimeout from 'p-timeout'
import {chromium, type Browser} from 'playwright'
import {expect, test as base} from 'vitest'
import {approvePending, type RunStream} from '@conciv/harness-testkit'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {disposeAll} from './dispose.js'

export type EngineOptions = Parameters<typeof bootCoreKit>[0]

export type NodeSession = {
  id: string
  send: (input: string) => Promise<RunStream>
  approve: () => Promise<string[]>
  callTool: (name: string, input: unknown) => Promise<unknown>
  events: () => Promise<RunStream>
  hydrate: () => ReturnType<CoreKit['hydrate']>
}

const BROWSER_CLOSE_TIMEOUT_MS = 30_000

export type ToolFailure = {tool: string; message: string}

export type PluginTool = {
  call: (input: unknown) => Promise<unknown>
  failure: (input: unknown) => Promise<ToolFailure>
}

export type NodePlugin = {engine: CoreKit; tool: (name: string) => PluginTool}

export type StartEngine = (overrides?: Partial<EngineOptions>) => Promise<CoreKit>

type NodeFixtures = {
  $test: {tmp: string; freshEngine: StartEngine; session: NodeSession; plugin: NodePlugin}
  $file: {engine: CoreKit; browser: Browser}
}

function failedTool(name: string, call: Promise<unknown>): Promise<ToolFailure> {
  return call.then(
    (output) => {
      throw new Error(`the tool ${name} answered instead of failing: ${JSON.stringify(output)}`)
    },
    (error: unknown) => ({tool: name, message: error instanceof Error ? error.message : String(error)}),
  )
}

export const test = base
  .extend('engineOptions', {scope: 'file'}, (): EngineOptions => ({id: 'engine'}))
  .extend<NodeFixtures>({
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    tmp: async ({}, use) => {
      const folder = await mkdtemp(join(tmpdir(), 'conciv-tmp-'))
      await use(folder)
      await rm(folder, {recursive: true, force: true, maxRetries: 10})
    },
    engine: [
      async ({engineOptions}, use) => {
        const engine = await bootCoreKit(engineOptions)
        await use(engine)
        await engine.cleanup()
      },
      {scope: 'file'},
    ],
    browser: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const browser = await chromium.launch()
        await use(browser)
        await pTimeout(browser.close(), {
          milliseconds: BROWSER_CLOSE_TIMEOUT_MS,
          message: `browser.close did not settle within ${BROWSER_CLOSE_TIMEOUT_MS}ms; a wedged CDP connection would otherwise hang fixture cleanup forever (vitest test.extend cleanup is unbounded)`,
        })
      },
      {scope: 'file'},
    ],
    freshEngine: async ({engineOptions}, use) => {
      const started: CoreKit[] = []
      await use(async (overrides = {}) => {
        const booted = await bootCoreKit({...engineOptions, ...overrides})
        const engine = {...booted, cleanup: once(booted.cleanup)}
        started.push(engine)
        return engine
      })
      await disposeAll(
        started.toReversed().map((engine) => engine.cleanup),
        'sequential',
        'a per-test engine did not stop cleanly',
      )
    },
    session: async ({engine}, use) => {
      const {sessionId} = await engine.rpc.sessions.create()
      const listening = new AbortController()
      await use({
        id: sessionId,
        send: (input) => engine.turn(input, {session: sessionId}),
        approve: async () => {
          await expect.poll(async () => (await engine.hydrate(sessionId)).pendingApprovals).not.toEqual([])
          return approvePending(engine.base, sessionId)
        },
        callTool: (name, input) => engine.callTool(name, input, sessionId),
        events: () => engine.events(sessionId, {signal: listening.signal}),
        hydrate: () => engine.hydrate(sessionId),
      })
      listening.abort()
    },
    plugin: async ({engine, session}, use) => {
      await use({
        engine,
        tool: (name) => ({
          call: (input) => session.callTool(name, input),
          failure: (input) => failedTool(name, session.callTool(name, input)),
        }),
      })
    },
  })
