import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {main} from '../src/bin.js'
import {runCli} from '../src/run.js'
import {answerNextQuery, bootCli} from './support/cli-app.js'
import {captureStdout, onlyDocument} from './support/stdout.js'

const cleanups: (() => Promise<void>)[] = []
const written: string[] = []

beforeEach(() => {
  captureStdout(written)
})

afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env.CONCIV_PORT
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('conciv CLI (IT, real served core, typed rpc)', () => {
  it('page fill drives registry.call and prints one success envelope with exit 0', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'a@b.c'}})
    const code = await runCli(main, ['tools', 'page', 'fill', '#email', '--value', 'a@b.c'])
    expect(answer.seen()).toMatchObject({name: 'page.fill', input: {selector: '#email', value: 'a@b.c'}})
    expect(code).toBe(0)
    expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true, value: 'a@b.c'}})
  })

  it('accepts --json on a verb and still prints exactly one document', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'x'}})
    const code = await runCli(main, ['tools', 'page', 'fill', '#email', '--value', 'x', '--json'])
    expect(answer.seen()).toMatchObject({name: 'page.fill', input: {selector: '#email'}})
    expect(code).toBe(0)
    expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true, value: 'x'}})
  })

  it('a page verb the browser refuses fails as a user error with the declared code and exit 1', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {
      ok: false,
      error: {code: 'invalid-args', message: 'no element for selector #email'},
    })
    const code = await runCli(main, ['tools', 'page', 'fill', '#email', '--value', 'a@b.c'])
    expect(answer.seen()).toMatchObject({name: 'page.fill', input: {selector: '#email'}})
    expect(code).toBe(1)
    expect(onlyDocument(written)).toEqual({
      ok: false,
      error: {kind: 'user', code: 'INVALID_ARGS', message: 'page.fill: no element for selector #email'},
    })
  })

  it('page snapshot with no widget fails as a user error with the declared code and exit 1', async () => {
    await bootCli(cleanups)
    const code = await runCli(main, ['tools', 'page', 'snapshot'])
    expect(code).toBe(1)
    expect(onlyDocument(written)).toEqual({
      ok: false,
      error: {kind: 'user', code: 'NO_PAGE_CLIENT', message: 'page.snapshot: no widget connected'},
    })
  })

  it('server config without a bridge fails as a user error with the declared code and exit 1', async () => {
    await bootCli(cleanups)
    const code = await runCli(main, ['tools', 'server', 'config'])
    expect(code).toBe(1)
    expect(onlyDocument(written)).toEqual({
      ok: false,
      error: {kind: 'user', code: 'NO_BUNDLER', message: 'no bundler bridge'},
    })
  })

  it('page wait with an invalid --state is a user error before any rpc call', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
    const code = await runCli(main, ['tools', 'page', 'wait', '#x', '--state', 'bogus'])
    expect(code).toBe(1)
    expect(answer.seen()).toBeNull()
    const failure = onlyDocument(written)
    expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
    expect(JSON.stringify(failure)).toContain('visible')
    expect(JSON.stringify(failure)).not.toContain('\\n    at ')
  })

  it('open with a non-numeric --line is a user error, not a raw zod stack', async () => {
    await bootCli(cleanups)
    const code = await runCli(main, ['tools', 'open', 'x.ts', '--line', 'abc'])
    expect(code).toBe(1)
    const failure = onlyDocument(written)
    expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
    expect(JSON.stringify(failure)).toContain('line')
  })

  it('page changes lists the journal in an envelope and --clear resets it', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'Ada'}})
    await runCli(main, ['tools', 'page', 'fill', '#name', '--value', 'Ada'])
    expect(answer.seen()).toMatchObject({name: 'page.fill'})
    written.length = 0
    expect(await runCli(main, ['tools', 'page', 'changes'])).toBe(0)
    expect(onlyDocument(written)).toMatchObject({ok: true, data: [{verb: 'page.fill', selector: '#name'}]})
    written.length = 0
    expect(await runCli(main, ['tools', 'page', 'changes', '--clear'])).toBe(0)
    expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true}})
    written.length = 0
    expect(await runCli(main, ['tools', 'page', 'changes'])).toBe(0)
    expect(onlyDocument(written)).toEqual({ok: true, data: []})
  })

  it('server graph round-trips a real bundler bridge inside the envelope', async () => {
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
    await bootCli(cleanups, {bridge})
    expect(await runCli(main, ['tools', 'server', 'graph', '/x.ts'])).toBe(0)
    expect(onlyDocument(written)).toEqual({
      ok: true,
      data: [{url: '/x.ts', importers: [], importedModules: ['dep.ts']}],
    })
  })

  it('tools open reaches the editor opener over rpc', async () => {
    const opened: Array<{file: string; line?: number}> = []
    await bootCli(cleanups, {openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})})})
    expect(await runCli(main, ['tools', 'open', 'src/thing.ts', '--line', '7'])).toBe(0)
    expect(opened).toEqual([{file: 'src/thing.ts', line: 7}])
    expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true}})
  })

  it('open without its required positional is a user error, not a raw citty stack', async () => {
    await bootCli(cleanups)
    const code = await runCli(main, ['tools', 'open'])
    expect(code).toBe(1)
    const failure = onlyDocument(written)
    expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
    expect(JSON.stringify(failure)).toContain('FILE')
  })
})
