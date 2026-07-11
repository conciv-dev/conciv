import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {runCommand} from 'citty'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {createFakeHarness, createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {ResolvedConcivConfig} from '@conciv/core/config'
import {toolsCommand} from '../src/tools.js'

type BootExtras = {
  bridge?: Parameters<typeof makeApp>[0]['bridge']
  openInEditor?: (file: string, line?: number) => void
}

function bootCliApp(extras: BootExtras = {}): BootApp {
  return async (env) => {
    const cfg: ResolvedConcivConfig = {
      enabled: true,
      widgetUrl: undefined,
      stateRoot: env.stateRoot,
      harness: env.harness.id,
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    }
    const {app, disposers} = await makeApp({
      cfg,
      cwd: env.cwd,
      openInEditor: extras.openInEditor ?? (() => {}),
      harness: env.harness,
      bridge: extras.bridge,
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }
}

const cleanups: (() => Promise<void>)[] = []
const written: string[] = []

beforeEach(() => {
  written.length = 0
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env.CONCIV_PORT
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootCli(extras: BootExtras = {}): Promise<Kit> {
  const kit = await createTestkit(createFakeHarness(), bootCliApp(extras)).setup()
  cleanups.push(() => kit.cleanup())
  process.env.CONCIV_PORT = new URL(kit.base).port
  return kit
}

type SeenQuery = Record<string, unknown>

async function answerNextQuery(kit: Kit, data: Record<string, unknown>): Promise<{seen: () => SeenQuery | null}> {
  const abort = new AbortController()
  const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
  const state: {seen: SeenQuery | null} = {seen: null}
  void (async () => {
    const first = await iterator.next()
    if (first.done) return
    const query = first.value.query
    state.seen = typeof query === 'object' && query !== null ? {...query} : {}
    await kit.rpc.page.reply({requestId: first.value.requestId, data})
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })()
  await new Promise((resolve) => setTimeout(resolve, 50))
  return {seen: () => state.seen}
}

describe('conciv CLI (IT, real served core, typed rpc)', () => {
  it('page fill drives page.run and prints the compact page reply', async () => {
    const kit = await bootCli()
    const answer = await answerNextQuery(kit, {ok: true})
    await runCommand(toolsCommand, {rawArgs: ['page', 'fill', '#email', '--value', 'a@b.c']})
    expect(answer.seen()).toMatchObject({kind: 'fill', selector: '#email', value: 'a@b.c'})
    expect(written).toEqual(['{"ok":true}\n'])
  })

  it('page snapshot with no widget prints the error envelope to stdout and resolves', async () => {
    await bootCli()
    await runCommand(toolsCommand, {rawArgs: ['page', 'snapshot']})
    expect(written).toEqual(['{"message":"no widget connected"}\n'])
  })

  it('page wait rejects an invalid --state via zod before any rpc call', async () => {
    await expect(runCommand(toolsCommand, {rawArgs: ['page', 'wait', '#x', '--state', 'bogus']})).rejects.toThrow()
    expect(written).toEqual([])
  })

  it('page changes lists the journal and --clear resets it', async () => {
    const kit = await bootCli()
    const answer = await answerNextQuery(kit, {ok: true})
    await runCommand(toolsCommand, {rawArgs: ['page', 'fill', '#name', '--value', 'Ada']})
    expect(answer.seen()).toMatchObject({kind: 'fill'})
    written.length = 0
    await runCommand(toolsCommand, {rawArgs: ['page', 'changes']})
    const listed: unknown = JSON.parse(written[0] ?? 'null')
    expect(listed).toMatchObject([{verb: 'fill', selector: '#name'}])
    written.length = 0
    await runCommand(toolsCommand, {rawArgs: ['page', 'changes', '--clear']})
    expect(written).toEqual(['{"ok":true}\n'])
    written.length = 0
    await runCommand(toolsCommand, {rawArgs: ['page', 'changes']})
    expect(written).toEqual(['[]\n'])
  })

  it('server graph round-trips a real bundler bridge and prints its JSON', async () => {
    const bridge = defineBundlerBridge({
      id: 'cli-test',
      config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
      resolve: async (spec) => ({id: spec}),
      moduleGraph: (file) => [{url: file, importers: [], importedModules: ['dep.ts']}],
      transform: async () => ({code: null}),
      urls: () => ({local: [], network: []}),
      reload: async () => {},
      restart: async () => {},
    })
    await bootCli({bridge})
    await runCommand(toolsCommand, {rawArgs: ['server', 'graph', '/x.ts']})
    expect(written).toEqual(['[{"url":"/x.ts","importers":[],"importedModules":["dep.ts"]}]\n'])
  })

  it('server config without a bridge prints the NO_BUNDLER envelope and resolves', async () => {
    await bootCli()
    await runCommand(toolsCommand, {rawArgs: ['server', 'config']})
    expect(written).toEqual(['{"message":"no bundler bridge"}\n'])
  })

  it('tools open reaches the editor opener over rpc', async () => {
    const opened: Array<{file: string; line?: number}> = []
    await bootCli({openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})})})
    await runCommand(toolsCommand, {rawArgs: ['open', 'src/thing.ts', '--line', '7']})
    expect(opened).toEqual([{file: 'src/thing.ts', line: 7}])
    expect(written).toEqual(['{"ok":true}\n'])
  })
})
