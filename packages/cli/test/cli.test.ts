import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi} from 'vitest'
import {main as cliMain} from '../src/main.js'
import {runCli} from '../src/run.js'
import {execFileSync, spawnSync} from 'node:child_process'
import {createServer} from 'node:net'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, dirname, join, relative, resolve as resolvePath} from 'node:path'
import {fileURLToPath} from 'node:url'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {createServer as createHttpServer, type Server} from 'node:http'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {engineOrigin} from '../src/engine-origin.js'
import {initCommand, runInitCommand} from '../src/init.js'
import {type Detected, detectFramework, detectProject, type Framework} from '../src/init/detect.js'
import {execFileOutcome} from '../src/init/exec.js'
import {detectHarnesses, type HarnessId} from '../src/init/harness-detect.js'
import {type ConfirmedSelections, type InitOutput, interactiveTerminal, type PlanPrompts} from '../src/init/wizard.js'
import {captureFile, guardBackups, onInterrupt} from '../src/init/interrupt.js'
import {writeOutcome} from '../src/envelope.js'
import type {LedgerEntry} from '../src/init/ledger.js'
import {emitOutro} from '../src/init/outro.js'
import {type InitContext, type InitStep, runInit, type RunSettings, runSteps} from '../src/init/pipeline.js'
import {preflight} from '../src/init/preflight.js'
import {claudeConnectDir, claudeConnectPluginFiles} from '@conciv/harness-init/claude/files'
import {writeConsent} from '../src/init/steps/harness/consent.js'
import {dlxCommand} from 'nypm'
import {docsPackStep} from '../src/init/steps/docs-pack.js'
import {stripVTControlCharacters} from 'node:util'
import {writeConfigChange} from '../src/init/steps/framework/config-edit.js'
import {
  addToPluginsArray,
  addToPluginsArrayRequire,
  defaultExportWrapped,
  pluginCallWired,
  wrapDefaultExport,
} from '../src/init/steps/framework/engine.js'
import {nextjsStep} from '../src/init/steps/framework/nextjs.js'
import {viteStep} from '../src/init/steps/framework/vite.js'
import {fallbackStep} from '../src/init/steps/framework/fallback.js'
import {webpackFamilyStep} from '../src/init/steps/framework/webpack-family.js'
import {agentsMdStep, agentsSection} from '../src/init/steps/harness/agents-md.js'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {claudeInit} from '@conciv/harness-init/claude'
import {type HarnessInitIo, harnessInitStep} from '../src/init/steps/harness/install-harness.js'
import {hasIt, installItStep} from '../src/init/steps/install-it.js'
import {
  answerNextQuery,
  approvedSession,
  bootCli,
  captureStdout,
  cliSession,
  commitAll,
  fixture as initFixture,
  type FoundSelections,
  onlyDocument,
  pendingChanges,
  recorderOutput,
  recorderPrompts,
  statusById,
  stepContext,
  stepsOf,
} from './helpers.js'

describe('cli', () => {
  describe('cli arguments', () => {
    const {cleanups, written} = cliSession()

    function failureText(): string {
      const parsed = onlyDocument(written)
      expect(parsed).toMatchObject({ok: false, error: {kind: 'user'}})
      return JSON.stringify(parsed)
    }

    describe('conciv CLI argument rejection', () => {
      it('rejects a mistyped flag with the closest known flag and never runs the verb', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        const code = await runCli(cliMain, ['tools', 'page', 'click', '--refs', 'e12'])
        expect(code).toBe(1)
        expect(answer.seen()).toBeNull()
        const text = failureText()
        expect(text).toContain('--refs')
        expect(text).toContain('--ref')
      })

      it('rejects a mistyped kebab spelling of a real flag and keeps accepting the real one', async () => {
        const kit = await bootCli(cleanups)
        expect(await runCli(cliMain, ['tools', 'react', 'override', '#a', '--hook-idx', '2'])).toBe(1)
        expect(failureText()).toContain('--hookId')
        written.length = 0
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, target: 'hooks', path: ''}})
        expect(
          await runCli(cliMain, [
            'tools',
            'react',
            'override',
            '#a',
            '--target',
            'hooks',
            '--hook-id',
            '2',
            '--json',
            'true',
          ]),
        ).toBe(0)
        expect(answer.seen()).toMatchObject({
          name: 'page_override',
          input: {selector: '#a', target: 'hooks', hookId: 2, json: 'true'},
        })
      })

      it('rejects an unknown flag placed before a nested subcommand instead of dropping it', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['tools', '--bogus', 'page', 'click', '#a'])).toBe(1)
        expect(answer.seen()).toBeNull()
        expect(failureText()).toContain('--bogus')
      })

      it('rejects an unknown flag placed before the very first subcommand', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['--bogus', 'tools', 'page', 'click', '#a'])).toBe(1)
        expect(answer.seen()).toBeNull()
        expect(failureText()).toContain('--bogus')
      })

      it('still accepts an envelope flag placed before a nested subcommand', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
        expect(await runCli(cliMain, ['tools', '--json', 'page', 'click', '#a'])).toBe(0)
        expect(answer.seen()).toMatchObject({name: 'page_click'})
      })

      it('rejects an unknown subcommand with the closest verb', async () => {
        await bootCli(cleanups)
        expect(await runCli(cliMain, ['tools', 'page', 'clik', '#a'])).toBe(1)
        const text = failureText()
        expect(text).toContain('clik')
        expect(text).toContain('click')
      })

      it('rejects a subcommand-less parent instead of printing a bare stack', async () => {
        await bootCli(cleanups)
        expect(await runCli(cliMain, ['tools', 'page'])).toBe(1)
        expect(failureText()).toContain('--help')
      })

      it('rejects a positional passed as a flag and says how to pass it', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['tools', 'page', 'click', '--selector', '#a'])).toBe(1)
        expect(answer.seen()).toBeNull()
        expect(failureText()).toContain('selector')
      })

      it('rejects an extra positional instead of dropping it', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['tools', 'page', 'click', '#a', '#b'])).toBe(1)
        expect(answer.seen()).toBeNull()
        expect(failureText()).toContain('#b')
      })

      it('prints usage for --help and exits 0 without touching the rpc', async () => {
        await bootCli(cleanups)
        const logged: string[] = []
        vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
          logged.push(String(line))
        })
        expect(await runCli(cliMain, ['tools', 'page', 'click', '--help'])).toBe(0)
        expect(written).toEqual([])
        expect(logged.join('\n')).toContain('--ref')
      })
    })
  })

  describe('cli bin', () => {
    const ESCAPE = '\u001b'
    const COLOR_VARIABLES = new Set(['NO_COLOR', 'FORCE_COLOR', 'CI', 'TEST', 'TERM'])
    const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

    let cwd = ''
    let closedPort = 0

    function freedPort(): Promise<number> {
      const server = createServer()
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          const address = server.address()
          const port = typeof address === 'object' && address !== null ? address.port : 0
          server.close(() => resolve(port))
        })
      })
    }

    function colorFreeEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
      const inherited = Object.entries(process.env).filter(([name]) => !COLOR_VARIABLES.has(name))
      return {...Object.fromEntries(inherited), TERM: 'xterm-256color', CONCIV_PORT: String(closedPort), ...extra}
    }

    function conciv(args: string[], extra: Record<string, string> = {}): {status: number | null; stdout: string} {
      const run = spawnSync(process.execPath, [bin, ...args], {cwd, env: colorFreeEnv(extra), encoding: 'utf8'})
      return {status: run.status, stdout: run.stdout}
    }

    beforeAll(async () => {
      cwd = mkdtempSync(join(tmpdir(), 'conciv-cli-bin-'))
      closedPort = await freedPort()
    })

    afterAll(() => {
      rmSync(cwd, {recursive: true, force: true})
    })

    describe('the built conciv bin through a pipe', () => {
      it('prints --help without ANSI escapes when stdout is not a terminal', () => {
        const help = conciv(['--help'])
        expect(help.status).toBe(0)
        expect(help.stdout).toContain('tools')
        expect(help.stdout).not.toContain(ESCAPE)
      })

      it('keeps colour when FORCE_COLOR asks for it', () => {
        expect(conciv(['--help'], {FORCE_COLOR: '1'}).stdout).toContain(ESCAPE)
      })

      it('lists the built-in page verbs offline and says so on the last line', () => {
        const help = conciv(['tools', 'page', '--help'])
        expect(help.status).toBe(0)
        expect(help.stdout).toContain('snapshot')
        expect(help.stdout).toContain('fill')
        expect(help.stdout.trim().split('\n').at(-1)).toBe(
          'offline: showing the built-in page capabilities; a running server may add more',
        )
      })

      it('lists only the react verbs under react --help offline', () => {
        const help = conciv(['tools', 'react', '--help'])
        expect(help.status).toBe(0)
        expect(help.stdout).toContain('locate')
        expect(help.stdout).not.toContain('fill')
      })

      it('shows a verb flags offline', () => {
        const help = conciv(['tools', 'page', 'fill', '--help'])
        expect(help.status).toBe(0)
        expect(help.stdout).toContain('--value')
      })

      it('running a page verb offline still fails, pointing at server.json and CONCIV_PORT', () => {
        const run = conciv(['tools', 'page', 'snapshot'])
        expect(run.status).toBe(1)
        const document: unknown = JSON.parse(run.stdout)
        expect(document).toMatchObject({
          ok: false,
          error: {
            kind: 'user',
            message: `No conciv dev server on 127.0.0.1:${closedPort}.`,
            hint: "Start your app (pnpm dev). conciv reads the engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port, not Vite's).",
          },
        })
      })
    })
  })

  describe('cli derived commands', () => {
    const {cleanups, written} = cliSession()

    const FailureSchema = z.object({ok: z.literal(false), error: z.object({kind: z.enum(['user', 'unexpected'])})})

    async function helpFor(argv: string[]): Promise<string> {
      const logged: string[] = []
      vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        logged.push(String(line))
      })
      expect(await runCli(cliMain, argv)).toBe(0)
      return logged.join('\n')
    }

    const beacon = defineTool({
      name: 'page_beacon',
      description: 'Raise the acme beacon over the page.',
      inputSchema: z.object({height: z.number().int().min(1)}),
      outputSchema: z.object({raised: z.boolean()}),
      meta: {
        summary: 'raise the acme beacon over the page',
        category: 'act',
        icon: 'pointer',
        label: {running: 'Raising the beacon', done: 'Raised the beacon'},
        mutating: true,
        mirrors: true,
      },
    }).client()

    const beaconExtension = defineExtension({name: 'acme-beacon', tools: [beacon]})

    describe('the CLI reads its commands from the tool declarations', () => {
      it('derives a page verb whose declaration carries card cosmetics the CLI itself ignores', async () => {
        await bootCli(cleanups, {extensions: [beaconExtension]})
        const help = await helpFor(['tools', 'page', '--help'])
        expect(help).toContain('raise the acme beacon over the page')
      })

      it('sends the effect argument to the server instead of dropping it', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {effect: 'confetti', enabled: true}})
        expect(await runCli(cliMain, ['tools', 'page', 'effect', '--action', 'enable', '--effect', 'confetti'])).toBe(0)
        expect(answer.seen()).toMatchObject({name: 'page_effect', input: {action: 'enable', effect: 'confetti'}})
      })

      it('accepts every action value the protocol declares, not only the first three', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['tools', 'react', 'track', '--action', 'toggle'])).toBe(0)
        expect(answer.seen()).toMatchObject({name: 'page_track', input: {action: 'toggle'}})
      })

      it('names the attribute of an edit separately from the React component name', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
        expect(
          await runCli(cliMain, ['tools', 'page', 'setattr', '#a', '--attribute', 'data-state', '--value', 'open']),
        ).toBe(0)
        expect(answer.seen()).toMatchObject({
          name: 'page_setattr',
          input: {selector: '#a', attribute: 'data-state', value: 'open'},
        })
      })

      it('rejects an edit that names no attribute rather than sending a nameless one', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {}})
        expect(await runCli(cliMain, ['tools', 'page', 'setattr', '#a', '--value', 'open'])).toBe(1)
        expect(answer.seen()).toBeNull()
      })

      it('clears a field when the value is explicitly empty', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: ''}})
        expect(await runCli(cliMain, ['tools', 'page', 'fill', '#email', '--value', ''])).toBe(0)
        expect(answer.seen()).toMatchObject({name: 'page_fill', input: {selector: '#email', value: ''}})
      })

      it('still refuses a required flag that was never passed at all', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
        expect(await runCli(cliMain, ['tools', 'page', 'fill', '#email'])).toBe(1)
        expect(answer.seen()).toBeNull()
      })

      it("describes a verb by what it does, never by the verb's own command path", async () => {
        await bootCli(cleanups)
        const help = await helpFor(['tools', 'page', '--help'])
        expect(help).not.toMatch(/page fill/)
        expect(help).toContain('type a value into a form field')
      })

      it('offers the screenshot verb under page, derived from its declaration', async () => {
        await bootCli(cleanups)
        const help = await helpFor(['tools', 'page', '--help'])
        expect(help).toContain('screenshot')
        expect(help).toContain('capture the visible viewport as a webp image')
      })

      it('offers the hot update wait under page, derived from its declaration', async () => {
        await bootCli(cleanups)
        const help = await helpFor(['tools', 'page', '--help'])
        expect(help).toMatch(/^\s+hmr\s/m)
        expect(help).toContain('after editing a file, wait for the hot update to land before reading the page')
      })

      it('offers the react verbs under react and leaves the page-only ones out', async () => {
        await bootCli(cleanups)
        const help = await helpFor(['tools', 'react', '--help'])
        expect(help).toContain('inspect')
        expect(help).toContain('override')
        expect(help).not.toContain('sethtml')
      })

      it('derives a dev-server operation and its positional from the declaration', async () => {
        const reloaded: string[] = []
        const kit = await bootCli(cleanups, {
          bridge: {
            id: 'derived-test',
            config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
            resolve: async (spec: string) => ({id: spec}),
            moduleGraph: () => [],
            transform: async () => ({code: null}),
            urls: () => ({local: ['http://localhost:3000'], network: []}),
            reload: async (file: string) => {
              reloaded.push(file)
            },
            restart: async () => {},
          },
        })
        const session = await approvedSession(kit)
        expect(await runCli(cliMain, ['tools', 'server', 'reload', 'src/hot.ts'])).toBe(1)
        expect(reloaded).toEqual([])
        expect(await session.approve()).toHaveLength(1)
        expect(await runCli(cliMain, ['tools', 'server', 'reload', 'src/hot.ts'])).toBe(0)
        expect(reloaded).toEqual(['src/hot.ts'])
      })

      it('takes the positional the dev-server declaration names and leaves its other fields as flags', async () => {
        const resolved: string[] = []
        await bootCli(cleanups, {
          bridge: {
            id: 'positional-test',
            config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
            resolve: async (spec: string, importer?: string) => {
              resolved.push(`${spec} from ${importer ?? 'nowhere'}`)
              return {id: spec}
            },
            moduleGraph: () => [],
            transform: async () => ({code: null}),
            urls: () => ({local: ['http://localhost:3000'], network: []}),
            reload: async () => {},
            restart: async () => {},
          },
        })
        expect(await runCli(cliMain, ['tools', 'server', 'resolve', './x.ts', '--importer', 'src/a.ts'])).toBe(0)
        expect(resolved).toEqual(['./x.ts from src/a.ts'])
      })

      it('rejects a non-positive line number as a plain user mistake, not a bug', async () => {
        await bootCli(cleanups)
        expect(await runCli(cliMain, ['tools', 'open', 'src/a.ts', '--line', '0'])).toBe(1)
        expect(FailureSchema.parse(onlyDocument(written)).error.kind).toBe('user')
      })

      it('rejects a fractional line number as a plain user mistake, not a bug', async () => {
        await bootCli(cleanups)
        expect(await runCli(cliMain, ['tools', 'open', 'src/a.ts', '--line', '1.5'])).toBe(1)
        expect(FailureSchema.parse(onlyDocument(written)).error.kind).toBe('user')
      })

      it('opens at a positive integer line number', async () => {
        const opened: {file: string; line?: number}[] = []
        await bootCli(cleanups, {openInEditor: (file, line) => opened.push({file, line})})
        expect(await runCli(cliMain, ['tools', 'open', 'src/a.ts', '--line', '3'])).toBe(0)
        expect(opened).toEqual([{file: 'src/a.ts', line: 3}])
      })
    })
  })

  describe('cli failures', () => {
    const written: string[] = []
    const servers: Server[] = []

    const FailureSchema = z.object({
      ok: z.literal(false),
      error: z.object({
        kind: z.enum(['user', 'unexpected']),
        message: z.string(),
        hint: z.string().optional(),
        code: z.string().optional(),
        stack: z.string().optional(),
      }),
    })

    beforeEach(() => {
      captureStdout(written)
    })

    afterEach(async () => {
      vi.restoreAllMocks()
      delete process.env.CONCIV_PORT
      for (const server of servers.splice(0)) await new Promise((done) => server.close(() => done(null)))
    })

    function failure(): z.infer<typeof FailureSchema>['error'] {
      return FailureSchema.parse(onlyDocument(written)).error
    }

    async function listen(handler: Parameters<typeof createHttpServer>[1]): Promise<number> {
      const server = createHttpServer(handler)
      servers.push(server)
      await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(null)))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port')
      return address.port
    }

    async function closedPort(): Promise<number> {
      const port = await listen((_request, response) => response.end('unused'))
      const server = servers.pop()
      if (server) await new Promise((done) => server.close(() => done(null)))
      return port
    }

    describe('conciv CLI failure reporting', () => {
      it('names the address and the fix when no dev server is listening, with no stack', async () => {
        process.env.CONCIV_PORT = String(await closedPort())
        const code = await runCli(cliMain, ['tools', 'server', 'urls'])
        expect(code).toBe(1)
        const error = failure()
        expect(error.kind).toBe('user')
        expect(error.message).toContain(`127.0.0.1:${process.env.CONCIV_PORT}`)
        expect(error.message).toContain('No conciv dev server')
        expect(error.hint).toContain('CONCIV_PORT')
        expect(error.stack).toBeUndefined()
        expect(JSON.stringify(error)).not.toContain('fetch failed')
      })

      it('reports a request the server rejected as a user error, not a bug', async () => {
        const body = JSON.stringify({
          defined: false,
          code: 'BAD_REQUEST',
          status: 400,
          message: 'Input validation failed',
        })
        process.env.CONCIV_PORT = String(
          await listen((_request, response) => {
            response.writeHead(400, {'content-type': 'application/json'})
            response.end(body)
          }),
        )
        const code = await runCli(cliMain, ['tools', 'server', 'urls'])
        expect(code).toBe(1)
        const error = failure()
        expect(error.kind).toBe('user')
        expect(error.code).toBe('BAD_REQUEST')
        expect(error.stack).toBeUndefined()
      })

      it('a page verb with no dev server fails as the standard envelope, not an unhandled rejection', async () => {
        process.env.CONCIV_PORT = String(await closedPort())
        const code = await runCli(cliMain, ['tools', 'page', 'snapshot'])
        expect(code).toBe(1)
        const error = failure()
        expect(error.kind).toBe('user')
        expect(error.message).toContain('No conciv dev server')
        expect(error.hint).toContain('.conciv/server.json')
        expect(error.hint).toContain('CONCIV_PORT')
      })

      it('a server whose catalog declares no page capabilities is reported, not silently shrunk', async () => {
        process.env.CONCIV_PORT = String(
          await listen((_request, response) => {
            response.writeHead(200, {'content-type': 'application/json'})
            response.end(JSON.stringify({json: []}))
          }),
        )
        const code = await runCli(cliMain, ['tools', 'page', 'snapshot'])
        expect(code).toBe(1)
        const error = failure()
        expect(error.kind).toBe('user')
        expect(error.message).toContain('no page capabilities')
      })

      it('reports an alien server on the port as a probable bug, with the stack', async () => {
        process.env.CONCIV_PORT = String(await listen((_request, response) => response.end('not a rpc reply')))
        const code = await runCli(cliMain, ['tools', 'server', 'urls'])
        expect(code).toBe(1)
        const error = failure()
        expect(error.kind).toBe('unexpected')
        expect(error.hint).toContain('bug')
        expect(error.stack).toContain('at ')
      })
    })
  })

  describe('cli', () => {
    const cleanups: (() => Promise<void>)[] = []
    const written: string[] = []

    beforeEach(() => {
      captureStdout(written)
    })

    afterEach(async () => {
      vi.restoreAllMocks()
      delete process.env.CONCIV_PORT
      delete process.env.CONCIV_SESSION_ID
      for (const cleanup of cleanups.splice(0)) await cleanup()
    })

    function restartCapableBridge() {
      return defineBundlerBridge({
        id: 'cli-restart-test',
        config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
        resolve: async (spec) => ({id: spec}),
        moduleGraph: (file) => [{url: file, importers: [], importedModules: []}],
        transform: async () => ({code: null}),
        urls: () => ({local: [], network: []}),
        reload: async () => {},
        restart: async () => {},
      })
    }

    describe('conciv CLI (IT, real served core, typed rpc)', () => {
      it('page fill drives registry.call and prints one success envelope with exit 0', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'a@b.c'}})
        const code = await runCli(cliMain, ['tools', 'page', 'fill', '#email', '--value', 'a@b.c'])
        expect(answer.seen()).toMatchObject({name: 'page_fill', input: {selector: '#email', value: 'a@b.c'}})
        expect(code).toBe(0)
        expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true, value: 'a@b.c'}})
      })

      it('accepts --json on a verb and still prints exactly one document', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'x'}})
        const code = await runCli(cliMain, ['tools', 'page', 'fill', '#email', '--value', 'x', '--json'])
        expect(answer.seen()).toMatchObject({name: 'page_fill', input: {selector: '#email'}})
        expect(code).toBe(0)
        expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true, value: 'x'}})
      })

      it('a page verb the browser refuses fails as a user error with the declared code and exit 1', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {
          ok: false,
          error: {code: 'invalid-args', message: 'no element for selector #email'},
        })
        const code = await runCli(cliMain, ['tools', 'page', 'fill', '#email', '--value', 'a@b.c'])
        expect(answer.seen()).toMatchObject({name: 'page_fill', input: {selector: '#email'}})
        expect(code).toBe(1)
        expect(onlyDocument(written)).toEqual({
          ok: false,
          error: {kind: 'user', code: 'INVALID_ARGS', message: 'page_fill: no element for selector #email'},
        })
      })

      it('page snapshot with no widget fails as a user error with the declared code and exit 1', async () => {
        await bootCli(cleanups)
        const code = await runCli(cliMain, ['tools', 'page', 'snapshot'])
        expect(code).toBe(1)
        expect(onlyDocument(written)).toMatchObject({
          ok: false,
          error: {
            kind: 'user',
            code: 'NO_PAGE_CLIENT',
            message: expect.stringContaining('page_snapshot: no widget connected to session'),
          },
        })
      })

      it('server config without a bridge fails as a user error with the declared code and exit 1', async () => {
        await bootCli(cleanups)
        const code = await runCli(cliMain, ['tools', 'server', 'config'])
        expect(code).toBe(1)
        expect(onlyDocument(written)).toEqual({
          ok: false,
          error: {kind: 'user', code: 'NO_BUNDLER', message: 'no bundler bridge'},
        })
      })

      it('page wait with an invalid --state is a user error before any rpc call', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
        const code = await runCli(cliMain, ['tools', 'page', 'wait', '#x', '--state', 'bogus'])
        expect(code).toBe(1)
        expect(answer.seen()).toBeNull()
        const failure = onlyDocument(written)
        expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
        expect(JSON.stringify(failure)).toContain('visible')
        expect(JSON.stringify(failure)).not.toContain('\\n    at ')
      })

      it('open with a non-numeric --line is a user error, not a raw zod stack', async () => {
        await bootCli(cleanups)
        const code = await runCli(cliMain, ['tools', 'open', 'x.ts', '--line', 'abc'])
        expect(code).toBe(1)
        const failure = onlyDocument(written)
        expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
        expect(JSON.stringify(failure)).toContain('line')
      })

      it('page changes lists the journal in an envelope and --clear resets it', async () => {
        const kit = await bootCli(cleanups)
        const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: 'Ada'}})
        await runCli(cliMain, ['tools', 'page', 'fill', '#name', '--value', 'Ada'])
        expect(answer.seen()).toMatchObject({name: 'page_fill'})
        written.length = 0
        expect(await runCli(cliMain, ['tools', 'page', 'changes'])).toBe(0)
        expect(onlyDocument(written)).toMatchObject({ok: true, data: [{verb: 'page_fill', selector: '#name'}]})
        written.length = 0
        expect(await runCli(cliMain, ['tools', 'page', 'changes', '--clear'])).toBe(0)
        expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true}})
        written.length = 0
        expect(await runCli(cliMain, ['tools', 'page', 'changes'])).toBe(0)
        expect(onlyDocument(written)).toEqual({ok: true, data: []})
      })

      it('server restart without a session context is refused with exit 1', async () => {
        const bridge = restartCapableBridge()
        await bootCli(cleanups, {bridge})
        const code = await runCli(cliMain, ['tools', 'server', 'restart'])
        expect(code).toBe(1)
        expect(onlyDocument(written)).toMatchObject({ok: false, error: {kind: 'user', code: 'APPROVAL_DENIED'}})
      })

      it('server restart is refused through the session and an approval lets the retry run', async () => {
        const bridge = restartCapableBridge()
        const kit = await bootCli(cleanups, {bridge})
        const session = await approvedSession(kit)
        expect(await runCli(cliMain, ['tools', 'server', 'restart'])).toBe(1)
        expect(onlyDocument(written)).toMatchObject({
          ok: false,
          error: {kind: 'user', code: 'APPROVAL_DENIED', message: expect.stringContaining('needs the user')},
        })
        written.length = 0
        expect(await session.approve()).toEqual(['conciv:tool:server_restart'])
        expect(await runCli(cliMain, ['tools', 'server', 'restart'])).toBe(0)
        expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true}})
        written.length = 0
        expect(await runCli(cliMain, ['tools', 'server', 'restart'])).toBe(1)
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
        expect(await runCli(cliMain, ['tools', 'server', 'graph', '/x.ts'])).toBe(0)
        expect(onlyDocument(written)).toEqual({
          ok: true,
          data: [{url: '/x.ts', importers: [], importedModules: ['dep.ts']}],
        })
      })

      it('tools open reaches the editor opener over rpc', async () => {
        const opened: Array<{file: string; line?: number}> = []
        await bootCli(cleanups, {
          openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})}),
        })
        expect(await runCli(cliMain, ['tools', 'open', 'src/thing.ts', '--line', '7'])).toBe(0)
        expect(opened).toEqual([{file: 'src/thing.ts', line: 7}])
        expect(onlyDocument(written)).toEqual({ok: true, data: {ok: true}})
      })

      it('open without its required positional is a user error, not a raw citty stack', async () => {
        await bootCli(cleanups)
        const code = await runCli(cliMain, ['tools', 'open'])
        expect(code).toBe(1)
        const failure = onlyDocument(written)
        expect(failure).toMatchObject({ok: false, error: {kind: 'user'}})
        expect(JSON.stringify(failure)).toContain('FILE')
      })
    })
  })

  describe('dependency closure', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const cliEntry = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

    const WORKSPACE_DIRS = ['packages', 'packages/extensions', 'apps']

    const BROWSER_ONLY = ['solid-js', 'lucide-solid', '@ark-ui/', '@conciv/ui-kit']

    function manifestDirs(): string[] {
      return WORKSPACE_DIRS.flatMap((group) => {
        const groupDir = join(repoRoot, group)
        if (!existsSync(groupDir)) return []
        return readdirSync(groupDir, {withFileTypes: true})
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(groupDir, entry.name))
          .filter((dir) => existsSync(join(dir, 'package.json')))
      })
    }

    function workspaceDirsByName(): Record<string, string> {
      const found: Record<string, string> = {}
      for (const dir of manifestDirs()) {
        const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        const name = typeof manifest === 'object' && manifest !== null && 'name' in manifest ? manifest.name : undefined
        if (typeof name === 'string') found[name] = dir
      }
      return found
    }

    function importTarget(entry: unknown): string | undefined {
      if (typeof entry === 'string') return entry
      if (typeof entry !== 'object' || entry === null) return undefined
      if ('import' in entry) return importTarget(entry.import)
      if ('default' in entry) return importTarget(entry.default)
      return undefined
    }

    function exportedFile(packageDir: string, subpath: string): string | undefined {
      const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
      if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) return undefined
      const map = manifest.exports
      if (typeof map !== 'object' || map === null) return undefined
      const key = subpath === '' ? '.' : `./${subpath}`
      if (!(key in map)) return undefined
      const target = importTarget(Reflect.get(map, key))
      return target ? resolvePath(packageDir, target) : undefined
    }

    const STATIC_SPECIFIER = /^(?:import|export)[^\n"']*["']([^"'\s]+)["'];?[^\n]*$/gm
    const LAZY_SPECIFIER = /import\(\s*["'](\.[^"'\s]+)["']/g

    function specifiersIn(file: string): string[] {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(STATIC_SPECIFIER), ...source.matchAll(LAZY_SPECIFIER)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      )
    }

    function packageNameOf(specifier: string): {name: string; subpath: string} {
      const parts = specifier.split('/')
      const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts.slice(0, 1).join('/')
      return {name, subpath: specifier.slice(name.length + 1)}
    }

    function existingFile(candidate: string | undefined): string | undefined {
      return candidate !== undefined && existsSync(candidate) ? candidate : undefined
    }

    function resolvedFrom(file: string, specifier: string, workspaces: Record<string, string>): string | undefined {
      if (specifier.startsWith('.')) return existingFile(resolvePath(dirname(file), specifier))
      const {name, subpath} = packageNameOf(specifier)
      const packageDir = workspaces[name]
      if (packageDir === undefined) return undefined
      return existingFile(exportedFile(packageDir, subpath))
    }

    function runtimeClosure(entry: string): Set<string> {
      const workspaces = workspaceDirsByName()
      const visited = new Set<string>()
      const external = new Set<string>()
      const queue = [entry]
      while (queue.length > 0) {
        const file = queue.pop()
        if (file === undefined || visited.has(file)) continue
        visited.add(file)
        for (const specifier of specifiersIn(file)) {
          if (!specifier.startsWith('.')) external.add(specifier)
          const next = resolvedFrom(file, specifier, workspaces)
          if (next !== undefined) queue.push(next)
        }
      }
      return external
    }

    test('the published CLI never loads the browser half of the widget stack', () => {
      const external = [...runtimeClosure(cliEntry)]
      const browser = external.filter((specifier) => BROWSER_ONLY.some((prefix) => specifier.startsWith(prefix)))
      expect(browser).toEqual([])
    })

    test('the CLI reads the tool declarations without loading the extension package index', () => {
      const external = runtimeClosure(cliEntry)
      expect([...external].filter((specifier) => specifier.startsWith('@conciv/extension')).toSorted()).toEqual([
        '@conciv/extension-page/defs',
        '@conciv/extension/tool',
      ])
    })
  })

  describe('engine origin', () => {
    const roots: string[] = []

    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
    })

    function projectWith(serverJson: string | null): {root: string; nested: string} {
      const root = mkdtempSync(join(tmpdir(), 'conciv-engine-origin-'))
      roots.push(root)
      const nested = join(root, 'src', 'deep')
      mkdirSync(nested, {recursive: true})
      if (serverJson !== null) {
        mkdirSync(join(root, '.conciv'))
        writeFileSync(join(root, '.conciv', 'server.json'), serverJson)
      }
      return {root, nested}
    }

    test('finds the engine port in .conciv/server.json walking up from a nested cwd', () => {
      const project = projectWith(JSON.stringify({port: 41234}))
      expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:41234')
      expect(engineOrigin(project.root, {})).toBe('http://127.0.0.1:41234')
    })

    test('CONCIV_PORT wins over .conciv/server.json', () => {
      const project = projectWith(JSON.stringify({port: 41234}))
      expect(engineOrigin(project.nested, {CONCIV_PORT: '45678'})).toBe('http://127.0.0.1:45678')
    })

    test('falls back to 5173 with no server.json anywhere up the tree', () => {
      const project = projectWith(null)
      expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:5173')
    })

    test('a malformed server.json falls through to 5173 instead of throwing', () => {
      const project = projectWith('{"port": "not a number"')
      expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:5173')
    })
  })

  describe('prod closure', () => {
    const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

    const BANNED = [
      '@conciv/harness',
      '@conciv/claude-connect',
      '@anthropic-ai/claude-agent-sdk',
      '@opencode-ai/sdk',
      '@agentclientprotocol/sdk',
      '@tanstack/ai-sandbox',
      '@tanstack/ai-acp',
      '@tanstack/ai-claude-code',
      '@tanstack/ai-codex',
      '@tanstack/ai-opencode',
    ]

    type Manifest = {name: string; dependencies: Record<string, string>}

    function closureEntryDir(entry: unknown): string {
      if (typeof entry !== 'object' || entry === null || !('path' in entry)) {
        throw new Error('pnpm listed a closure entry without a path')
      }
      const {path} = entry
      if (typeof path !== 'string') throw new Error('pnpm listed a closure entry whose path is not a string')
      return path
    }

    function prodClosureDirs(): string[] {
      const output = execFileSync('pnpm', ['--filter-prod', '@conciv/cli...', 'ls', '--depth', '-1', '--json'], {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString()
      const parsed: unknown = JSON.parse(output)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('pnpm reported an empty production closure for @conciv/cli')
      }
      return parsed.map(closureEntryDir)
    }

    function manifestOf(dir: string): Manifest {
      const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (typeof raw !== 'object' || raw === null || !('name' in raw) || typeof raw.name !== 'string') {
        throw new Error(`invalid manifest at ${dir}`)
      }
      const dependencies =
        'dependencies' in raw && typeof raw.dependencies === 'object' && raw.dependencies !== null
          ? Object.fromEntries(Object.entries(raw.dependencies).map(([name, range]) => [name, String(range)]))
          : {}
      return {name: raw.name, dependencies}
    }

    test('the CLI production closure carries harness-init but never the harness package or an agent sdk', () => {
      const manifests = prodClosureDirs().map(manifestOf)
      const names = manifests.map((manifest) => manifest.name)
      expect(names).toContain('@conciv/harness-init')
      for (const banned of BANNED) expect(names).not.toContain(banned)
      for (const manifest of manifests) {
        const declared = Object.keys(manifest.dependencies).filter((name) => BANNED.includes(name))
        expect(declared, `${manifest.name} declares a banned production dependency`).toEqual([])
      }
    })
  })
})

describe('init', () => {
  describe('init command', () => {
    describe('init command', () => {
      it('declares the three flags with kebab-case names', () => {
        const args = initCommand.args
        expect(args).toMatchObject({
          yes: {type: 'boolean', default: false},
          'dry-run': {type: 'boolean', default: false},
          force: {type: 'boolean', default: false},
        })
      })

      it('registers under the root command', async () => {
        const {main} = await import('../src/main.js')
        const subCommands = await Promise.resolve(main.subCommands)
        expect(Object.keys(subCommands ?? {})).toContain('init')
      })
    })
  })

  describe('init detect', () => {
    const dir = (): string => mkdtempSync(join(tmpdir(), 'conciv-detect-'))

    const seed = (cwd: string, manifest: object): void => {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
    }

    describe('detectFramework', () => {
      it('prefers nextjs when next and vite are both present', () => {
        const cwd = dir()
        seed(cwd, {dependencies: {next: '15.0.0'}, devDependencies: {vite: '6.0.0'}})
        writeFileSync(join(cwd, 'next.config.ts'), 'export default {}')
        expect(detectFramework(cwd)).toEqual({framework: 'nextjs', configFile: 'next.config.ts'})
      })
      it('finds the vite config under its actual extension', () => {
        const cwd = dir()
        seed(cwd, {devDependencies: {vite: '6.0.0'}})
        writeFileSync(join(cwd, 'vite.config.mts'), 'export default {}')
        expect(detectFramework(cwd)).toEqual({framework: 'vite', configFile: 'vite.config.mts'})
      })
      it('reports unknown with no config for a deps-less manifest', () => {
        const cwd = dir()
        seed(cwd, {name: 'bare'})
        expect(detectFramework(cwd)).toEqual({framework: 'unknown', configFile: null})
      })
      it('ranks rspack above webpack and reports a missing config as null', () => {
        const cwd = dir()
        seed(cwd, {devDependencies: {'@rspack/cli': '1.0.0', webpack: '5.0.0'}})
        expect(detectFramework(cwd)).toEqual({framework: 'rspack', configFile: null})
      })
      it('detects astro ahead of the vite it declares and finds astro.config.mjs', () => {
        const cwd = dir()
        seed(cwd, {dependencies: {astro: '5.0.0'}, devDependencies: {vite: '6.0.0'}})
        writeFileSync(join(cwd, 'astro.config.mjs'), 'export default {}')
        expect(detectFramework(cwd)).toEqual({framework: 'astro', configFile: 'astro.config.mjs'})
      })
      it('finds a cjs webpack config', () => {
        const cwd = dir()
        seed(cwd, {devDependencies: {webpack: '5.0.0'}})
        writeFileSync(join(cwd, 'webpack.config.cjs'), 'module.exports = {}')
        expect(detectFramework(cwd)).toEqual({framework: 'webpack', configFile: 'webpack.config.cjs'})
      })
      it('finds an mjs rspack config', () => {
        const cwd = dir()
        seed(cwd, {devDependencies: {'@rspack/core': '1.0.0'}})
        writeFileSync(join(cwd, 'rspack.config.mjs'), 'export default {}')
        expect(detectFramework(cwd)).toEqual({framework: 'rspack', configFile: 'rspack.config.mjs'})
      })
      it('detects esbuild with no config file convention', () => {
        const cwd = dir()
        seed(cwd, {devDependencies: {esbuild: '0.24.0'}})
        expect(detectFramework(cwd)).toEqual({framework: 'esbuild', configFile: null})
      })
    })

    describe('detectProject', () => {
      it('honors the packageManager manifest field', async () => {
        const cwd = dir()
        seed(cwd, {packageManager: 'pnpm@10.0.0', devDependencies: {vite: '6.0.0'}})
        writeFileSync(join(cwd, 'vite.config.ts'), 'export default {}')
        expect(await detectProject(cwd)).toEqual({
          framework: 'vite',
          configFile: 'vite.config.ts',
          packageManager: 'pnpm',
        })
      })
      it('falls back to npm when nothing marks a manager', async () => {
        const cwd = dir()
        seed(cwd, {})
        expect(await detectProject(cwd)).toEqual({framework: 'unknown', configFile: null, packageManager: 'npm'})
      })
    })
  })

  describe('init exec', () => {
    describe('execFileOutcome', () => {
      it('settles a nonzero code with the exit code and output when the child exits normally', async () => {
        const outcome = await execFileOutcome(
          'node',
          ['-e', 'process.stdout.write("hi"); process.exit(3)'],
          {cwd: process.cwd()},
          () => {},
        )
        expect(outcome).toEqual({code: 3, output: 'hi'})
      })

      it('reports a nonzero exit code and a signal note when the child is killed by a signal', async () => {
        const outcome = await execFileOutcome(
          'node',
          ['-e', 'process.kill(process.pid, "SIGKILL")'],
          {cwd: process.cwd()},
          () => {},
        )
        expect(outcome.code).not.toBe(0)
        expect(outcome.output).toContain('terminated by SIGKILL')
      }, 5000)
    })
  })

  describe('init harness detect', () => {
    const dir = (label: string): string => mkdtempSync(join(tmpdir(), `conciv-harness-${label}-`))

    const shim = (binDir: string, name: string): void => {
      const file = join(binDir, name)
      writeFileSync(file, '#!/bin/sh\nexit 0\n')
      chmodSync(file, 0o755)
    }

    describe('detectHarnesses', () => {
      it('finds a harness by an executable shim on PATH', () => {
        const binDir = dir('bin')
        const home = dir('home')
        shim(binDir, 'claude')
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'claude', via: 'path'}])
      })
      it('finds a harness by its config marker under HOME', () => {
        const binDir = dir('bin')
        const home = dir('home')
        mkdirSync(join(home, '.codex'))
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'codex', via: 'config'}])
      })
      it('finds opencode by its nested config marker', () => {
        const binDir = dir('bin')
        const home = dir('home')
        mkdirSync(join(home, '.config', 'opencode'), {recursive: true})
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'opencode', via: 'config'}])
      })
      it('reports a single entry with via path when both mechanisms hit', () => {
        const binDir = dir('bin')
        const home = dir('home')
        shim(binDir, 'pi')
        mkdirSync(join(home, '.pi'))
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'pi', via: 'path'}])
      })
      it('ignores a PATH file without the exec bit', () => {
        const binDir = dir('bin')
        const home = dir('home')
        const file = join(binDir, 'codex')
        writeFileSync(file, 'not a binary')
        chmodSync(file, 0o644)
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([])
      })
      it('walks multiple PATH entries', () => {
        const emptyDir = dir('empty')
        const binDir = dir('bin')
        const home = dir('home')
        shim(binDir, 'opencode')
        expect(detectHarnesses({PATH: [emptyDir, binDir].join(delimiter), HOME: home})).toEqual([
          {id: 'opencode', via: 'path'},
        ])
      })
      it('finds gemini-cli by its gemini binary on PATH', () => {
        const binDir = dir('bin')
        const home = dir('home')
        shim(binDir, 'gemini')
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'gemini-cli', via: 'path'}])
      })
      it('finds gemini-cli by its config marker under HOME', () => {
        const binDir = dir('bin')
        const home = dir('home')
        mkdirSync(join(home, '.gemini'))
        expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'gemini-cli', via: 'config'}])
      })
      it('returns an empty list when nothing is installed', () => {
        expect(detectHarnesses({PATH: dir('bin'), HOME: dir('home')})).toEqual([])
      })
    })
  })

  describe('init interactive', () => {
    const restores: (() => void)[] = []

    function fakeTty(stream: {isTTY?: boolean}, value: boolean): void {
      const original = stream.isTTY
      restores.push(() => {
        stream.isTTY = original
      })
      stream.isTTY = value
    }

    afterEach(() => {
      for (const restore of restores.splice(0)) restore()
    })

    describe('interactiveTerminal', () => {
      it('is not interactive when stdout is a terminal but stdin is not', () => {
        fakeTty(process.stdout, true)
        fakeTty(process.stdin, false)
        expect(interactiveTerminal()).toBe(false)
      })

      it('is not interactive when stdin is a terminal but stdout is redirected', () => {
        fakeTty(process.stdout, false)
        fakeTty(process.stdin, true)
        expect(interactiveTerminal()).toBe(false)
      })

      it('is interactive when both streams are terminals outside CI', () => {
        const ci = process.env.CI
        restores.push(() => {
          if (ci === undefined) delete process.env.CI
          else process.env.CI = ci
        })
        delete process.env.CI
        fakeTty(process.stdout, true)
        fakeTty(process.stdin, true)
        expect(interactiveTerminal()).toBe(true)
      })
    })
  })

  describe('init interrupt', () => {
    function scratchFile(name: string, content: string): string {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-interrupt-'))
      const path = join(dir, name)
      writeFileSync(path, content)
      return path
    }

    type SignalListeners = ReturnType<typeof process.listeners<'SIGINT'>>

    function fireNewSigintListener(before: SignalListeners): void {
      const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
      const listener = added[0]
      if (added.length !== 1 || listener === undefined) {
        throw new Error(`expected exactly one new SIGINT listener, found ${added.length}`)
      }
      listener('SIGINT')
    }

    describe('guardBackups', () => {
      it('restores every remembered file when restore runs, newest write last', () => {
        const first = scratchFile('vite.config.ts', 'first original')
        const second = scratchFile('next.config.ts', 'second original')
        const guard = guardBackups()
        guard.remember({path: first, content: 'first original'})
        guard.remember({path: second, content: 'second original'})
        writeFileSync(first, 'clobbered')
        writeFileSync(second, 'clobbered')
        guard.restore()
        guard.release()
        expect(readFileSync(first, 'utf8')).toBe('first original')
        expect(readFileSync(second, 'utf8')).toBe('second original')
      })

      it('restores remembered files when the process exits before release, and stops after release', () => {
        const path = scratchFile('vite.config.ts', 'original')
        const guard = guardBackups()
        guard.remember({path, content: 'original'})
        writeFileSync(path, 'clobbered mid-run')
        process.emit('exit', 0)
        expect(readFileSync(path, 'utf8')).toBe('original')
        guard.release()
        writeFileSync(path, 'after release')
        process.emit('exit', 0)
        expect(readFileSync(path, 'utf8')).toBe('after release')
      })

      it('removes a file the run created when the captured backup recorded it as absent', () => {
        const dir = mkdtempSync(join(tmpdir(), 'conciv-interrupt-'))
        const created = join(dir, 'AGENTS.md')
        const guard = guardBackups()
        guard.remember(captureFile(created))
        writeFileSync(created, 'written mid-run')
        guard.restore()
        guard.release()
        expect(existsSync(created)).toBe(false)
      })

      it('captures the current content of a file that already exists', () => {
        const path = scratchFile('vite.config.ts', 'original')
        const guard = guardBackups()
        guard.remember(captureFile(path))
        writeFileSync(path, 'clobbered')
        guard.restore()
        guard.release()
        expect(readFileSync(path, 'utf8')).toBe('original')
      })

      it('leaves no exit listener behind after release', () => {
        const baseline = process.listeners('exit').length
        guardBackups().release()
        expect(process.listeners('exit').length).toBe(baseline)
      })
    })

    describe('onInterrupt', () => {
      it('registers a SIGINT listener that runs the handler and removes it on release', () => {
        const before = process.listeners('SIGINT')
        const fired: string[] = []
        const release = onInterrupt(() => {
          fired.push('interrupted')
        })
        fireNewSigintListener(before)
        expect(fired).toEqual(['interrupted'])
        release()
        expect(process.listeners('SIGINT')).toEqual(before)
      })

      it('restores a clobbered config when the interrupt handler runs a backup restore', () => {
        const path = scratchFile('vite.config.ts', 'original')
        const guard = guardBackups()
        guard.remember({path, content: 'original'})
        const before = process.listeners('SIGINT')
        const release = onInterrupt(() => {
          guard.restore()
        })
        writeFileSync(path, 'half-wired')
        fireNewSigintListener(before)
        expect(readFileSync(path, 'utf8')).toBe('original')
        release()
        guard.release()
      })
    })
  })

  describe('init json', () => {
    const written: string[] = []

    beforeEach(() => {
      captureStdout(written)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    const SuccessSchema = z.object({ok: z.literal(true), data: z.unknown()})
    const FailureSchema = z.object({
      ok: z.literal(false),
      error: z.object({kind: z.enum(['user', 'unexpected']), message: z.string(), hint: z.string().optional()}),
    })

    type RunOptions = Parameters<typeof runInitCommand>[0]
    type RunOverrides = Parameters<typeof runInitCommand>[1]

    async function runJson(options: RunOptions, overrides: RunOverrides): Promise<{code: number; document: unknown}> {
      const code = await writeOutcome(runInitCommand(options, overrides))
      return {code, document: onlyDocument(written)}
    }

    function fakeTerminal(): {restore: () => void} {
      const streams = [process.stdin, process.stdout]
      const before = streams.map((stream) => stream.isTTY)
      const ci = process.env.CI
      for (const stream of streams) stream.isTTY = true
      delete process.env.CI
      return {
        restore: () => {
          streams.forEach((stream, index) => {
            stream.isTTY = before[index] ?? false
          })
          if (ci !== undefined) process.env.CI = ci
        },
      }
    }

    const throwingPrompts = {
      selections: async () => {
        throw new Error('selections must not run here')
      },
      confirmRun: async () => {
        throw new Error('confirmRun must not run here')
      },
    }

    describe('conciv init --json', () => {
      it('emits exactly one success envelope with the steps and next lines, and no clack frames', async () => {
        const run = initFixture({recordOutput: false})
        const {code, document} = await runJson(
          {yes: true, dryRun: false, force: false, cwd: run.cwd, json: true},
          run.runtime,
        )
        expect(code).toBe(0)
        const parsed = SuccessSchema.parse(document)
        expect(parsed.data).toMatchObject({
          steps: [
            {id: 'install', status: 'done'},
            {id: 'framework', status: 'done'},
            {id: 'agents', status: 'done'},
            {id: 'claude', status: 'done'},
          ],
        })
        expect(JSON.stringify(parsed.data)).toContain('pnpm dev')
      })

      it('reports a cancelled run as a refusal with a reason and exit 1, never an empty step list', async () => {
        const run = initFixture({recordOutput: false})
        const {code, document} = await runJson(
          {yes: false, dryRun: false, force: false, cwd: run.cwd, json: true},
          {
            ...run.runtime,
            interactive: () => true,
            prompts: {...recorderPrompts(run.events), selections: async () => 'cancelled'},
          },
        )
        expect(code).toBe(1)
        const parsed = FailureSchema.parse(document)
        expect(parsed.error.kind).toBe('user')
        expect(parsed.error.message).toContain('cancelled')
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
      })

      it('reports a preflight refusal as a user error with the reason and exit 1', async () => {
        const run = initFixture({recordOutput: false})
        writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
        const {code, document} = await runJson(
          {yes: true, dryRun: false, force: false, cwd: run.cwd, json: true},
          run.runtime,
        )
        expect(code).toBe(1)
        expect(FailureSchema.parse(document).error.message).toContain('uncommitted changes')
        expect(run.added).toEqual([])
      })

      it('reports a dry run as a plan that changed nothing', async () => {
        const run = initFixture({recordOutput: false})
        const {code, document} = await runJson(
          {yes: false, dryRun: true, force: false, cwd: run.cwd, json: true},
          {
            ...run.runtime,
            prompts: throwingPrompts,
          },
        )
        expect(code).toBe(0)
        expect(JSON.stringify(SuccessSchema.parse(document).data)).toContain('Install @conciv/it')
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
      })

      it('refuses to prompt under --json even on a real terminal', async () => {
        const run = initFixture({recordOutput: false, injectInteractive: false})
        const terminal = fakeTerminal()
        const {code, document} = await runJson(
          {yes: false, dryRun: false, force: false, cwd: run.cwd, json: true},
          {
            ...run.runtime,
            prompts: throwingPrompts,
          },
        )
        terminal.restore()
        expect(code).toBe(1)
        expect(FailureSchema.parse(document).error.message).toContain('--yes')
      })
    })

    describe('conciv init human mode', () => {
      it('keeps clack output and writes no envelope when a run completes', async () => {
        const run = initFixture()
        const code = await writeOutcome(
          runInitCommand({yes: true, dryRun: false, force: false, cwd: run.cwd, json: false}, run.runtime),
        )
        expect(code).toBe(0)
        expect(written).toEqual([])
        expect(run.events).toContain('intro:conciv init')
      })

      it('exits 1 when the human run is cancelled', async () => {
        const run = initFixture()
        const code = await writeOutcome(
          runInitCommand(
            {yes: false, dryRun: false, force: false, cwd: run.cwd, json: false},
            {...run.runtime, prompts: {...recorderPrompts(run.events), selections: async () => 'cancelled'}},
          ),
        )
        expect(code).toBe(1)
        expect(written).toEqual([])
        expect(run.events).toContain('cancel:Nothing changed.')
      })
    })
  })

  describe('init outro', () => {
    const nextSteps = ['start your app: pnpm dev', 'ask your agent to run conciv tools --help']

    function emitted(entries: LedgerEntry[], next: string[] = nextSteps): string[] {
      const events: string[] = []
      emitOutro(recorderOutput(events), entries, next)
      return events
    }

    describe('emitOutro', () => {
      it('emits every manual card as a note carrying its title, body, and snippet', () => {
        const events = emitted([
          {id: 'install', title: 'Install @conciv/it', status: 'done', cards: []},
          {
            id: 'framework',
            title: 'Wire the vite config',
            status: 'manual',
            cards: [
              {
                title: 'Wire the conciv vite plugin',
                body: 'add the plugin yourself',
                snippet: "import conciv from 'x'",
              },
              {title: 'Inject the widget', body: 'serve the bundle'},
            ],
          },
        ])
        expect(events).toContain("note:Wire the conciv vite plugin:add the plugin yourself\n\nimport conciv from 'x'")
        expect(events).toContain('note:Inject the widget:serve the bundle')
        expect(events.join('\n')).not.toMatch(/[┌└│]/)
      })

      it('warns the summary and points at the docs in the outro when a card printed', () => {
        const events = emitted([
          {id: 'install', title: 'Install @conciv/it', status: 'done', cards: []},
          {id: 'agents', title: 'Teach agents', status: 'done', cards: []},
          {
            id: 'framework',
            title: 'Wire the vite config',
            status: 'manual',
            cards: [{title: 'Wire it', body: 'by hand'}],
          },
          {id: 'claude', title: 'Install the conciv claude plugin', status: 'skipped', cards: []},
        ])
        expect(events).toContain('warn:2 wired · 1 manual step below · 1 skipped')
        const outro = events.filter((event) => event.startsWith('outro:'))
        expect(outro).toHaveLength(1)
        expect(outro[0]).toContain('pnpm dev')
        expect(outro[0]).toContain('conciv tools --help')
        expect(outro[0]).toContain('https://conciv.dev/docs/quick-start')
      })

      it('reports success with no docs link when nothing needs a manual step', () => {
        const events = emitted([{id: 'install', title: 'Install @conciv/it', status: 'done', cards: []}])
        expect(events).toContain('success:1 wired')
        expect(events.some((event) => event.startsWith('warn:'))).toBe(false)
        const outro = events.filter((event) => event.startsWith('outro:'))
        expect(outro[0]).toContain('pnpm dev')
        expect(outro[0]).not.toContain('https://conciv.dev/docs/quick-start')
      })

      it('says every step was already wired on a re-run', () => {
        const events = emitted([
          {id: 'install', title: 'Install @conciv/it', status: 'already', cards: []},
          {id: 'framework', title: 'Wire the vite config', status: 'already', cards: []},
        ])
        expect(events).toContain('success:2 already wired')
      })

      it('pluralises manual steps and drops next steps when there are none', () => {
        const events = emitted(
          [
            {id: 'framework', title: 'Wire the vite config', status: 'manual', cards: [{title: 'a', body: 'b'}]},
            {
              id: 'claude',
              title: 'Install the conciv claude plugin',
              status: 'manual',
              cards: [{title: 'c', body: 'd'}],
            },
          ],
          [],
        )
        expect(events).toContain('warn:2 manual steps below')
        expect(events.filter((event) => event.startsWith('outro:'))).toHaveLength(1)
      })
    })
  })

  describe('init pipeline', () => {
    const settings = (over: Partial<RunSettings> = {}): RunSettings => ({
      cwd: '/tmp/nowhere',
      yes: true,
      dryRun: false,
      backup: () => {},
      interrupt: () => () => {},
      ...over,
    })

    const step = (over: Partial<InitStep>): InitStep => ({
      id: 'x',
      title: 'X',
      running: 'Doing x…',
      completed: 'Did x',
      detect: async () => 'missing',
      plan: async () => ({summary: 'would do x', wouldEdit: []}),
      apply: async () => ({status: 'done'}),
      verify: async () => true,
      manualCard: () => ({title: 'Wire X by hand', body: 'add x to your config'}),
      ...over,
    })

    function recorded(): {events: string[]; output: InitOutput} {
      const events: string[] = []
      return {events, output: recorderOutput(events)}
    }

    describe('runSteps', () => {
      it('skips apply for already-wired steps', async () => {
        let applied = false
        const {events, output} = recorded()
        const entries = await runSteps(
          [step({detect: async () => 'present', apply: async () => ((applied = true), {status: 'done'})})],
          settings(),
          output,
        )
        expect(applied).toBe(false)
        expect(entries[0]?.status).toBe('already')
        expect(events).toEqual(['step:Doing x…', 'settle:already:X — already wired'])
      })

      it('degrades a throwing step to its manual card and continues', async () => {
        const {events, output} = recorded()
        const entries = await runSteps(
          [step({id: 'boom', apply: async () => Promise.reject(new Error('nope'))}), step({id: 'after'})],
          settings(),
          output,
        )
        expect(entries.map((entry) => entry.status)).toEqual(['manual', 'done'])
        expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
        expect(entries[0]?.detail).toBe('nope')
        expect(events).toContain('settle:manual:X — needs a manual step: nope')
        expect(events).toContain('settle:done:Did x')
      })

      it('dry-run plans without applying', async () => {
        let applied = false
        const {events, output} = recorded()
        const entries = await runSteps(
          [step({apply: async () => ((applied = true), {status: 'done'})})],
          settings({dryRun: true}),
          output,
        )
        expect(applied).toBe(false)
        expect(entries[0]?.status).toBe('skipped')
        expect(events.join('\n')).toContain('would do x')
      })

      it('degrades to the manual card when verify rejects the result', async () => {
        const {events, output} = recorded()
        const entries = await runSteps([step({verify: async () => false})], settings(), output)
        expect(entries[0]?.status).toBe('manual')
        expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
        expect(entries[0]?.detail).toBe('verification failed')
        expect(events).toContain('settle:manual:X — needs a manual step: verification failed')
      })

      it('releases the interrupt handler for each step it finishes', async () => {
        const registered: string[] = []
        const {output} = recorded()
        await runSteps(
          [step({id: 'one'}), step({id: 'two'})],
          settings({
            interrupt: () => {
              registered.push('on')
              return () => registered.push('off')
            },
          }),
          output,
        )
        expect(registered).toEqual(['on', 'off', 'on', 'off'])
      })

      it('emits the notes and lines a step reported only after its line resolves', async () => {
        const {events, output} = recorded()
        await runSteps(
          [
            step({
              apply: async (ctx) => {
                ctx.note({title: 'vite.config.ts', body: 'the diff'})
                ctx.report('created instrumentation.ts')
                return {status: 'done'}
              },
            }),
          ],
          settings(),
          output,
        )
        expect(events).toEqual([
          'step:Doing x…',
          'settle:done:Did x',
          'note:vite.config.ts:the diff',
          'line:created instrumentation.ts',
        ])
      })
    })
  })

  describe('init preflight', () => {
    const dir = (): string => mkdtempSync(join(tmpdir(), 'conciv-init-'))

    describe('preflight', () => {
      it('refuses without package.json', async () => {
        expect(await preflight(dir(), false)).toEqual({
          ok: false,
          reason: 'no package.json here — run init from your app directory',
        })
      })
      it('accepts a clean repo (file committed, not just written)', async () => {
        const cwd = dir()
        writeFileSync(join(cwd, 'package.json'), '{}')
        execFileSync('git', ['init'], {cwd})
        execFileSync('git', ['add', 'package.json'], {cwd})
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
        expect(await preflight(cwd, false)).toEqual({ok: true})
      })
      it('proceeds in a directory that is not a git repository at all', async () => {
        const cwd = dir()
        writeFileSync(join(cwd, 'package.json'), '{}')
        expect(await preflight(cwd, false)).toEqual({ok: true})
      })

      it('refuses when git itself cannot run instead of reading the silence as a clean tree', async () => {
        const cwd = dir()
        writeFileSync(join(cwd, 'package.json'), '{}')
        const restore = process.env.PATH
        process.env.PATH = join(cwd, 'no-tools-here')
        try {
          const result = await preflight(cwd, false)
          expect(result.ok).toBe(false)
          if (result.ok) throw new Error('expected preflight to refuse')
          expect(result.reason).toContain('git status')
        } finally {
          process.env.PATH = restore
        }
      })

      it('refuses untracked, staged, and unstaged dirt; force overrides each', async () => {
        const cwd = dir()
        writeFileSync(join(cwd, 'package.json'), '{}')
        execFileSync('git', ['init'], {cwd})
        const refused = {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
        expect(await preflight(cwd, false)).toEqual(refused)
        execFileSync('git', ['add', 'package.json'], {cwd})
        expect(await preflight(cwd, false)).toEqual(refused)
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
        writeFileSync(join(cwd, 'package.json'), '{"name":"edited"}')
        expect(await preflight(cwd, false)).toEqual(refused)
        expect(await preflight(cwd, true)).toEqual({ok: true})
      })
    })
  })

  describe('init run', () => {
    function recordedConsent(cwd: string): unknown {
      return JSON.parse(readFileSync(join(cwd, '.conciv', 'harnesses.json'), 'utf8'))
    }

    const plansOf = (events: string[]) => events.filter((event) => event.startsWith('plan:'))

    const settlesOf = (events: string[]) => events.filter((event) => event.startsWith('settle:'))

    function planLine(plan: string, title: string): string {
      const line = plan.split('\n').find((row) => row.includes(title))
      if (line === undefined) throw new Error(`plan has no row for ${title}`)
      return line
    }

    function acceptWith(selections: ConfirmedSelections): PlanPrompts {
      return {
        selections: async () => selections,
        confirmRun: async () => true,
      }
    }

    function acceptingAllFound(events: string[]): PlanPrompts {
      return {
        selections: async (found: FoundSelections) => {
          events.push('selections')
          return {framework: true, harnesses: found.harnesses.map((one) => one.id), docsPack: false}
        },
        confirmRun: async () => {
          events.push('confirmRun')
          return true
        },
      }
    }

    describe('runInit', () => {
      it('wires a vite project end to end with --yes over the injected runtime', async () => {
        const run = initFixture()
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(statusById(result)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
        expect(run.added).toEqual(['@conciv/it'])
        expect(readFileSync(join(run.cwd, 'package.json'), 'utf8')).toContain('@conciv/it')
        expect(readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')).toContain('@conciv/it/plugin/vite')
        expect(readFileSync(join(run.cwd, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
        expect(recordedConsent(run.cwd)).toEqual({harnesses: ['claude']})
        expect(run.spawned).toEqual([
          `claude plugin marketplace add ${claudeConnectDir(join(run.cwd, '.conciv'))}`,
          'claude plugin install conciv-connect@conciv --scope local',
        ])
        expect(run.events).toContain('intro:conciv init')
        expect(run.events).toContain('spin-stop:Detected: vite (vite.config.ts) · pnpm · harnesses: claude')
        expect(run.events).not.toContain('selections')
        const plans = plansOf(run.events)
        expect(plans).toHaveLength(1)
        expect(plans[0]).toContain('Install @conciv/it')
        expect(plans[0]).toContain('package.json')
        expect(plans[0]).toContain('Wire the vite config')
        expect(plans[0]).toContain('vite.config.ts')
        expect(plans[0]).toContain('Teach agents the conciv CLI')
        expect(plans[0]).toContain('Install the conciv claude plugin')
        expect(plans[0]).toContain('● claude')
        expect(plans[0]).toContain('○ codex (not found)')
        const output = run.events.join('\n')
        expect(output).toContain('pnpm dev')
        expect(output).toContain('.conciv/bin/conciv tools --help')
      })

      it('returns the completed steps and the next lines as data', async () => {
        const run = initFixture()
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(result.outcome).toBe('completed')
        expect(result.outcome === 'completed' ? result.next : []).toEqual([
          'start your app: pnpm dev',
          'ask your agent to run .conciv/bin/conciv tools --help',
        ])
      })

      it('runs every step as a live line that names the slow work and resolves in place', async () => {
        const run = initFixture()
        await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(run.events).toContain('step:Installing @conciv/it with pnpm…')
        expect(run.events).toContain('step:Wiring vite.config.ts…')
        expect(run.events).toContain('step:Installing the conciv claude plugin…')
        expect(settlesOf(run.events)).toEqual([
          'settle:done:Installed @conciv/it',
          'settle:done:Wired vite.config.ts',
          'settle:done:Wrote the conciv section to AGENTS.md',
          'settle:done:Installed the conciv claude plugin',
        ])
        const stepAt = run.events.indexOf('step:Wiring vite.config.ts…')
        const settleAt = run.events.indexOf('settle:done:Wired vite.config.ts')
        expect(stepAt).toBeGreaterThan(-1)
        expect(settleAt).toBeGreaterThan(stepAt)
        expect(run.events).toContain('success:4 wired')
      })

      it('streams the claude plugin install output into that step before it settles', async () => {
        const run = initFixture()
        await runInit(
          {yes: true, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            spawn: async (bin, args, spawnCwd, onLine) => {
              onLine(`running: ${bin} ${args.join(' ')}`)
              const outcome = await run.runtime.spawn?.(bin, args, spawnCwd, onLine)
              return outcome ?? {code: 0, output: ''}
            },
          },
        )
        const stepAt = run.events.indexOf('step:Installing the conciv claude plugin…')
        const settleAt = run.events.indexOf('settle:done:Installed the conciv claude plugin')
        const streamedAt = run.events.findIndex((event) =>
          event.startsWith('stepline:running: claude plugin marketplace add'),
        )
        expect(stepAt).toBeGreaterThan(-1)
        expect(streamedAt).toBeGreaterThan(stepAt)
        expect(streamedAt).toBeLessThan(settleAt)
      })

      it('renders the applied config change as a note titled with the file, under its step', async () => {
        const run = initFixture()
        await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        const diffNote = run.events.find((event) => event.startsWith('note:vite.config.ts:'))
        expect(diffNote).toBeDefined()
        expect(diffNote).toContain("+import conciv from '@conciv/it/plugin/vite'")
        expect(run.events.indexOf('settle:done:Wired vite.config.ts')).toBeLessThan(run.events.indexOf(diffNote ?? ''))
      })

      it('resolves a step that can only card as a manual line with its own reason and keeps going', async () => {
        const run = initFixture({configFixture: 'vite.config.no-plugins.ts'})
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(statusById(result)).toEqual({install: 'done', framework: 'manual', agents: 'done', claude: 'done'})
        expect(run.events).toContain('settle:manual:Wire the vite config — needs a manual step (see the card below)')
        expect(run.events.some((event) => event.startsWith('note:Wire the conciv vite plugin:'))).toBe(true)
        expect(run.events).toContain('warn:3 wired · 1 manual step below')
        expect(run.events).toContain('settle:done:Installed the conciv claude plugin')
      })

      it('resolves an unselected step as skipped with its reason', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {...run.runtime, prompts: acceptWith({framework: true, harnesses: [], docsPack: false})},
        )
        expect(statusById(result).claude).toBe('skipped')
        expect(run.events).toContain('settle:skipped:Install the conciv claude plugin — skipped: not selected')
        expect(run.spawned).toEqual([])
      })

      it('asks the questions once, renders the plan once, then applies the chosen selection', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            prompts: {
              selections: async () => {
                run.events.push('selections')
                return {framework: false, harnesses: [], docsPack: false}
              },
              confirmRun: async () => {
                run.events.push('confirmRun')
                return true
              },
            },
          },
        )
        const selectionsAt = run.events.indexOf('selections')
        expect(selectionsAt).toBeGreaterThan(-1)
        const firstPlanAt = run.events.findIndex((event) => event.startsWith('plan:'))
        expect(firstPlanAt).toBeGreaterThan(selectionsAt)
        expect(firstPlanAt).toBeLessThan(run.events.indexOf('confirmRun'))
        const plans = plansOf(run.events)
        expect(plans).toHaveLength(1)
        expect(plans[0]).not.toContain('Wire the vite config')
        expect(plans[0]).toContain('○ claude (not selected)')
        expect(statusById(result)).toEqual({install: 'done', agents: 'done', claude: 'skipped'})
        expect(recordedConsent(run.cwd)).toEqual({harnesses: []})
        expect(run.spawned).toEqual([])
      })

      it('reports already on the second run for every step the first run completed', async () => {
        const run = initFixture()
        const first = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        const doneIds = stepsOf(first)
          .filter((entry) => entry.status === 'done')
          .map((entry) => entry.id)
        expect(doneIds.length).toBeGreaterThan(0)
        commitAll(run.cwd)
        const second = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        for (const id of doneIds) {
          expect(statusById(second)[id], id).toBe('already')
        }
        expect(run.added).toEqual(['@conciv/it'])
        expect(run.spawned).toHaveLength(2)
        const plans = plansOf(run.events)
        expect(plans[1]).toContain('already wired')
        expect(run.events).toContain('settle:already:Install @conciv/it — already wired')
        expect(run.events).toContain('success:4 already wired')
      })

      it('plans the dry run against this run selections, not the harnesses a previous run recorded', async () => {
        const run = initFixture()
        await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        writeConsent(run.cwd, ['claude', 'codex'])
        commitAll(run.cwd)
        const result = await runInit(
          {yes: false, dryRun: true, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            interactive: () => false,
            prompts: {
              selections: async () => {
                throw new Error('selections must not run under --dry-run')
              },
              confirmRun: async () => {
                throw new Error('confirmRun must not run under --dry-run')
              },
            },
          },
        )
        const plan = result.outcome === 'planned' ? result.plan : ''
        expect(planLine(plan, 'Teach agents the conciv CLI')).toContain('already wired')
        expect(planLine(plan, 'Teach agents the conciv CLI')).not.toContain('AGENTS.md')
      })

      it('prints the plan and touches nothing with --dry-run', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: true, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            interactive: () => false,
            prompts: {
              selections: async () => {
                throw new Error('selections must not run under --dry-run')
              },
              confirmRun: async () => {
                throw new Error('confirmRun must not run under --dry-run')
              },
            },
          },
        )
        expect(result.outcome).toBe('planned')
        expect(result.outcome === 'planned' ? result.plan : '').toContain('Install @conciv/it')
        const plans = plansOf(run.events)
        expect(plans).toHaveLength(1)
        expect(plans[0]).toContain('Install @conciv/it')
        expect(run.events).toContain('outro:Dry run — nothing changed.')
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('prints the plan and touches nothing when --yes and --dry-run are passed together', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: true, dryRun: true, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            interactive: () => false,
            prompts: {
              selections: async () => {
                throw new Error('selections must not run under --dry-run')
              },
              confirmRun: async () => {
                throw new Error('confirmRun must not run under --dry-run')
              },
            },
          },
        )
        expect(result.outcome).toBe('planned')
        expect(result.outcome === 'planned' ? result.plan : '').toContain('Install @conciv/it')
        const plans = plansOf(run.events)
        expect(plans).toHaveLength(1)
        expect(plans[0]).toContain('Install @conciv/it')
        expect(run.events).toContain('outro:Dry run — nothing changed.')
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('refuses a non-interactive terminal without --yes instead of waiting on an invisible prompt', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            interactive: () => false,
            prompts: {
              selections: async () => {
                throw new Error('selections must not run without a terminal')
              },
              confirmRun: async () => {
                throw new Error('confirmRun must not run without a terminal')
              },
            },
          },
        )
        expect(result).toEqual({
          outcome: 'refused',
          reason: 'Non-interactive terminal — re-run with --yes or --dry-run',
        })
        expect(run.events).toContain('error:Non-interactive terminal — re-run with --yes or --dry-run')
        expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
        expect(plansOf(run.events)).toEqual([])
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('runs a non-interactive terminal to completion with --yes', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: true, dryRun: false, force: false, cwd: run.cwd},
          {...run.runtime, interactive: () => false},
        )
        expect(statusById(result)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
      })

      it('restores the config, says so, and exits 130 when the run is interrupted mid-apply', async () => {
        const run = initFixture()
        const original = readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')
        const before = process.listeners('SIGINT')
        let fired = false
        await runInit(
          {yes: true, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            spawn: async (bin, args) => {
              if (!fired) {
                fired = true
                const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
                expect(added).toHaveLength(1)
                added[0]?.('SIGINT')
              }
              return {code: 0, output: `${bin} ${args.join(' ')}`}
            },
          },
        )
        expect(fired).toBe(true)
        expect(readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')).toBe(original)
        expect(run.events).toContain('cancel:Interrupted — your config was restored.')
        expect(run.exits).toEqual([130])
        expect(process.listeners('SIGINT')).toEqual(before)
      })

      it('leaves the working tree pristine when the run is interrupted mid-apply', async () => {
        const run = initFixture()
        const before = process.listeners('SIGINT')
        let atInterrupt: string[] | null = null
        await runInit(
          {yes: true, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            spawn: async (bin, args) => {
              if (atInterrupt === null) {
                const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
                expect(added).toHaveLength(1)
                added[0]?.('SIGINT')
                atInterrupt = pendingChanges(run.cwd)
              }
              return {code: 0, output: `${bin} ${args.join(' ')}`}
            },
          },
        )
        expect(atInterrupt).toEqual([])
        expect(run.events).toContain('cancel:Interrupted — your config was restored.')
        expect(run.exits).toEqual([130])
      })

      it('refuses a dirty tree with the reason', async () => {
        const run = initFixture()
        writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(result).toEqual({outcome: 'refused', reason: 'uncommitted changes — commit first or pass --force'})
        expect(run.events).toContain('error:uncommitted changes — commit first or pass --force')
        expect(run.events.some((event) => event.startsWith('spin-fail:'))).toBe(true)
        expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('refuses a directory without a package.json with the reason', async () => {
        const run = initFixture()
        const empty = mkdtempSync(join(tmpdir(), 'conciv-init-empty-'))
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: empty}, run.runtime)
        expect(result).toEqual({outcome: 'refused', reason: 'no package.json here — run init from your app directory'})
        expect(run.events).toContain('error:no package.json here — run init from your app directory')
      })

      it('plans the manual card honestly when no framework is detected', async () => {
        const run = initFixture({configFixture: null, vite: false})
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(run.events).toContain('spin-stop:Detected: unknown · pnpm · harnesses: claude')
        expect(plansOf(run.events)[0]).toContain('manual — prints instructions')
        expect(statusById(result).framework).toBe('manual')
        expect(run.events.some((event) => event.startsWith('note:Wire conciv with Vite:'))).toBe(true)
      })

      it('wires an astro project through the vite plugin step', async () => {
        const run = initFixture({configFixture: null, vite: false})
        writeFileSync(
          join(run.cwd, 'package.json'),
          `${JSON.stringify({name: 'fixture-app', version: '0.0.0', packageManager: 'pnpm@10.0.0', devDependencies: {astro: '^5.0.0'}}, null, 2)}\n`,
        )
        writeFileSync(
          join(run.cwd, 'astro.config.mjs'),
          readFileSync(join(import.meta.dirname, 'fixtures', 'astro.config.mjs'), 'utf8'),
        )
        commitAll(run.cwd)
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(run.events).toContain('spin-stop:Detected: astro (astro.config.mjs) · pnpm · harnesses: claude')
        expect(statusById(result).framework).toBe('done')
        const written = readFileSync(join(run.cwd, 'astro.config.mjs'), 'utf8')
        expect(written).toContain("import conciv from '@conciv/it/plugin/vite'")
        expect(written).toContain('plugins: [conciv()]')
      })

      it('says no harnesses were found and still teaches agents the CLI', async () => {
        const run = initFixture({claude: false})
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(run.events).toContain('spin-stop:Detected: vite (vite.config.ts) · pnpm · harnesses: none found')
        expect(plansOf(run.events)[0]).toContain('Harnesses: none found')
        expect(statusById(result).agents).toBe('done')
        expect(statusById(result).claude).toBe('skipped')
        expect(readFileSync(join(run.cwd, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
      })

      it('leaves the @conciv/skills docs pack untouched by default, even under --yes', async () => {
        const run = initFixture()
        const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
        expect(statusById(result)['docs-pack']).toBeUndefined()
        expect(run.added).toEqual(['@conciv/it'])
        expect(readFileSync(join(run.cwd, 'package.json'), 'utf8')).not.toContain('@conciv/skills')
        expect(run.spawned).not.toContain('pnpm dlx @tanstack/intent@latest install')
      })

      it('adds the @conciv/skills docs pack and runs intent install once the user opts in', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {...run.runtime, prompts: acceptWith({framework: true, harnesses: ['claude'], docsPack: true})},
        )
        expect(statusById(result)['docs-pack']).toBe('done')
        expect(run.added).toEqual(['@conciv/it', '@conciv/skills'])
        expect(readFileSync(join(run.cwd, 'package.json'), 'utf8')).toContain('@conciv/skills')
        expect(run.spawned).toContain('pnpm dlx @tanstack/intent@latest install')
      })

      it('degrades the docs pack to a manual card when the intent install spawn fails', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            prompts: acceptWith({framework: true, harnesses: ['claude'], docsPack: true}),
            spawn: async (bin, args, spawnCwd, onLine) => {
              if (bin === 'pnpm' && args[0] === 'dlx' && args[1] === '@tanstack/intent@latest') {
                return {code: 1, output: 'network unreachable'}
              }
              const outcome = await run.runtime.spawn?.(bin, args, spawnCwd, onLine)
              return outcome ?? {code: 0, output: ''}
            },
          },
        )
        expect(statusById(result)['docs-pack']).toBe('manual')
        expect(run.added).toEqual(['@conciv/it', '@conciv/skills'])
        const docsPackEntry =
          result.outcome === 'completed' ? result.steps.find((entry) => entry.id === 'docs-pack') : undefined
        expect(docsPackEntry?.detail).toBe('network unreachable')
        expect(docsPackEntry?.cards[0]?.snippet).toContain('pnpm dlx @tanstack/intent@latest install')
      })

      it('reports a wizard cancel as a cancellation that changed nothing', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {...run.runtime, prompts: {...recorderPrompts(run.events), selections: async () => 'cancelled'}},
        )
        expect(result).toEqual({outcome: 'cancelled', reason: 'cancelled — nothing changed'})
        expect(run.events).toContain('cancel:Nothing changed.')
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('declines the final confirm and writes nothing — no edit loop, no re-render', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {...run.runtime, prompts: {...acceptingAllFound(run.events), confirmRun: async () => false}},
        )
        expect(result).toEqual({outcome: 'cancelled', reason: 'cancelled — nothing changed'})
        expect(run.events).toContain('cancel:Nothing changed.')
        expect(plansOf(run.events)).toHaveLength(1)
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })

      it('reports a cancel while answering the questions as a cancellation that changed nothing', async () => {
        const run = initFixture()
        const result = await runInit(
          {yes: false, dryRun: false, force: false, cwd: run.cwd},
          {
            ...run.runtime,
            prompts: {
              selections: async () => 'cancelled',
              confirmRun: async () => {
                throw new Error('confirmRun must not run once the questions were cancelled')
              },
            },
          },
        )
        expect(result.outcome).toBe('cancelled')
        expect(run.events).toContain('cancel:Nothing changed.')
        expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
        expect(run.added).toEqual([])
        expect(run.spawned).toEqual([])
      })
    })
  })
})

describe('steps', () => {
  describe('docs pack', () => {
    const intentBlock = '<!-- intent-skills:start -->\nguidance\n<!-- intent-skills:end -->\n'
    const intentStartOnly = '<!-- intent-skills:start -->\nguidance, no end marker\n'

    function project(manifest: object, feed: (line: string) => void = () => {}): InitContext {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-docs-pack-'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
      return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}, feed}
    }

    describe('docsPackStep', () => {
      it('detects present only once the dependency and the intent guidance block both exist', async () => {
        const step = docsPackStep(
          async () => {},
          async () => ({code: 0, output: ''}),
        )
        expect(await step.detect(project({name: 'app'}))).toBe('missing')
        const withDepOnly = project({devDependencies: {'@conciv/skills': '^0.0.19'}})
        expect(await step.detect(withDepOnly)).toBe('missing')
        writeFileSync(join(withDepOnly.cwd, 'AGENTS.md'), intentBlock)
        expect(await step.detect(withDepOnly)).toBe('present')
      })

      it('does not treat a lone start marker as an installed block', async () => {
        const step = docsPackStep(
          async () => {},
          async () => ({code: 0, output: ''}),
        )
        const ctx = project({devDependencies: {'@conciv/skills': '^0.0.19'}})
        writeFileSync(join(ctx.cwd, 'AGENTS.md'), intentStartOnly)
        expect(await step.detect(ctx)).toBe('missing')
      })

      it('backs up AGENTS.md before the intent spawn so an interrupt restores its pre-run content', async () => {
        const ctx = project({
          name: 'app',
          packageManager: 'pnpm@10.14.0',
          devDependencies: {'@conciv/skills': '^0.0.19'},
        })
        const original = '# my project\n\nhand-written rules stay put.\n'
        writeFileSync(join(ctx.cwd, 'AGENTS.md'), original)
        const guard = guardBackups()
        const contextWithGuard: InitContext = {...ctx, backup: guard.remember}
        const step = docsPackStep(
          async () => {},
          async (_bin, _args, cwd) => {
            writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
            return {code: 0, output: ''}
          },
        )
        const outcome = await step.apply(contextWithGuard)
        expect(outcome).toEqual({status: 'done'})
        expect(readFileSync(join(ctx.cwd, 'AGENTS.md'), 'utf8')).toBe(intentBlock)
        guard.restore()
        guard.release()
        expect(readFileSync(join(ctx.cwd, 'AGENTS.md'), 'utf8')).toBe(original)
      })

      it('adds the dependency and runs intent install, landing the dep and verifying', async () => {
        const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
        const spawned: {bin: string; args: string[]; cwd: string}[] = []
        const step = docsPackStep(
          async (name, opts) => {
            const manifestPath = join(opts.cwd, 'package.json')
            writeFileSync(
              manifestPath,
              JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
            )
          },
          async (bin, args, cwd) => {
            spawned.push({bin, args, cwd})
            writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
            return {code: 0, output: ''}
          },
        )
        expect(await step.apply(ctx)).toEqual({status: 'done'})
        expect(await step.detect(ctx)).toBe('present')
        expect(await step.verify(ctx)).toBe(true)
        expect(spawned).toEqual([{bin: 'pnpm', args: ['dlx', '@tanstack/intent@latest', 'install'], cwd: ctx.cwd}])
        const written: unknown = JSON.parse(readFileSync(join(ctx.cwd, 'package.json'), 'utf8'))
        expect(written).toEqual({
          name: 'app',
          packageManager: 'pnpm@10.14.0',
          devDependencies: {'@conciv/skills': '^0.0.19'},
        })
      })

      it('an already-present dependency skips the add call but still runs intent install for a missing block', async () => {
        const ctx = project({
          name: 'app',
          packageManager: 'pnpm@10.14.0',
          devDependencies: {'@conciv/skills': '^0.0.19'},
        })
        let addCalled = false
        const spawned: {bin: string; args: string[]; cwd: string}[] = []
        const step = docsPackStep(
          async () => {
            addCalled = true
          },
          async (bin, args, cwd) => {
            spawned.push({bin, args, cwd})
            writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
            return {code: 0, output: ''}
          },
        )
        expect(await step.detect(ctx)).toBe('missing')
        expect(await step.apply(ctx)).toEqual({status: 'done'})
        expect(addCalled).toBe(false)
        expect(spawned).toEqual([{bin: 'pnpm', args: ['dlx', '@tanstack/intent@latest', 'install'], cwd: ctx.cwd}])
        expect(await step.verify(ctx)).toBe(true)
      })

      it('a throwing add degrades to manual with both commands on the card', async () => {
        const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
        const step = docsPackStep(
          async () => {
            throw new Error('registry unreachable')
          },
          async () => ({code: 0, output: ''}),
        )
        const outcome = await step.apply(ctx)
        expect(outcome).toEqual({
          status: 'manual',
          detail: 'registry unreachable',
          cards: [
            {
              title: 'Add the @conciv/skills docs pack',
              body: 'The automatic setup failed. Run these in your project:',
              snippet: 'pnpm add --save-dev @conciv/skills\npnpm dlx @tanstack/intent@latest install',
            },
          ],
        })
        expect(await step.verify(ctx)).toBe(false)
      })

      it('a failing intent install spawn degrades to manual once the dependency already landed, card omits the add line', async () => {
        const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
        const step = docsPackStep(
          async (name, opts) => {
            const manifestPath = join(opts.cwd, 'package.json')
            writeFileSync(
              manifestPath,
              JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
            )
          },
          async () => ({code: 1, output: 'intent: network error'}),
        )
        const outcome = await step.apply(ctx)
        expect(outcome).toEqual({
          status: 'manual',
          detail: 'intent: network error',
          cards: [
            {
              title: 'Add the @conciv/skills docs pack',
              body: 'The automatic setup failed. Run these in your project:',
              snippet: 'pnpm dlx @tanstack/intent@latest install',
            },
          ],
        })
        expect(await step.detect(ctx)).toBe('missing')
      })

      it('streams spawned intent-install lines into the step feed while the manual card keeps the full output', async () => {
        const fed: string[] = []
        const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'}, (line) => fed.push(line))
        const step = docsPackStep(
          async (name, opts) => {
            const manifestPath = join(opts.cwd, 'package.json')
            writeFileSync(
              manifestPath,
              JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
            )
          },
          async (_bin, _args, _cwd, onLine) => {
            onLine('resolving intent skill…')
            onLine('installed 1 package')
            return {code: 1, output: 'resolving intent skill…\ninstalled 1 package'}
          },
        )
        const outcome = await step.apply(ctx)
        expect(fed).toEqual(['resolving intent skill…', 'installed 1 package'])
        expect(outcome).toMatchObject({status: 'manual', detail: 'resolving intent skill…\ninstalled 1 package'})
      })

      it('uses the detected package manager for npm projects, not a hardcoded pnpm command', async () => {
        const ctx = project({name: 'app'})
        writeFileSync(join(ctx.cwd, 'package-lock.json'), JSON.stringify({name: 'app', lockfileVersion: 3}))
        const spawned: {bin: string; args: string[]; cwd: string}[] = []
        const step = docsPackStep(
          async (name, opts) => {
            const manifestPath = join(opts.cwd, 'package.json')
            writeFileSync(manifestPath, JSON.stringify({name: 'app', devDependencies: {[name]: '^0.0.19'}}))
          },
          async (bin, args, cwd) => {
            spawned.push({bin, args, cwd})
            return {code: 1, output: 'intent: still missing'}
          },
        )
        const outcome = await step.apply(ctx)
        const expectedCommand = dlxCommand('npm', '@tanstack/intent@latest', {args: ['install']})
        const [expectedBin, ...expectedArgs] = expectedCommand.split(' ')
        expect(spawned).toEqual([{bin: expectedBin, args: expectedArgs, cwd: ctx.cwd}])
        expect(outcome).toEqual({
          status: 'manual',
          detail: 'intent: still missing',
          cards: [
            {
              title: 'Add the @conciv/skills docs pack',
              body: 'The automatic setup failed. Run these in your project:',
              snippet: expectedCommand,
            },
          ],
        })
      })
    })
  })

  describe('framework', () => {
    describe('config edit', () => {
      function renderChange(before: string, after: string): string {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-config-edit-'))
        const path = join(cwd, 'vite.config.ts')
        writeFileSync(path, before)
        const {notes, ctx} = stepContext(cwd)
        writeConfigChange(ctx, {name: 'vite.config.ts', path, content: before}, after)
        expect(notes.map((note) => note.title)).toEqual(['vite.config.ts'])
        return stripVTControlCharacters(notes.map((note) => note.body).join('\n'))
      }

      const middle = Array.from({length: 20}, (value, index) => `const middle${index} = ${index}`).join('\n')

      const before = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
${middle}
export default defineConfig({
  plugins: [react()],
})
`

      const after = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
${middle}
export default defineConfig({
  plugins: [react(), conciv()],
})
`

      describe('writeConfigChange diff rendering', () => {
        it('renders two disjoint edits as two small hunks with context, never the whole file', () => {
          const rendered = renderChange(before, after)
          const hunkHeaders = rendered.split('\n').filter((line) => line.startsWith('@@'))
          expect(hunkHeaders).toHaveLength(2)
          expect(rendered).not.toContain('const middle9 = 9')
          expect(rendered).toContain("+import conciv from '@conciv/it/plugin/vite'")
          expect(rendered).toContain('-  plugins: [react()],')
          expect(rendered).toContain('+  plugins: [react(), conciv()],')
        })

        it('renders an insertion-only change as one hunk of at most inserted plus context lines', () => {
          const inserted = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
${middle}
export default defineConfig({
  plugins: [react()],
})
`
          const rendered = renderChange(before, inserted)
          const bodyLines = rendered.split('\n').filter((line) => !line.startsWith('---') && !line.startsWith('+++'))
          const hunkHeaders = bodyLines.filter((line) => line.startsWith('@@'))
          expect(hunkHeaders).toHaveLength(1)
          expect(bodyLines.length).toBeLessThanOrEqual(6)
          expect(bodyLines).toContain(" import react from '@vitejs/plugin-react'")
          expect(rendered).not.toContain('const middle9 = 9')
          expect(rendered).not.toContain('export default defineConfig({')
        })

        it('keeps the filename header lines', () => {
          const rendered = renderChange(before, after)
          expect(rendered).toContain('--- vite.config.ts')
          expect(rendered).toContain('+++ vite.config.ts')
        })
      })
    })

    describe('engine', () => {
      const fixturesDir = join(import.meta.dirname, 'fixtures')

      function fixture(name: string): string {
        return readFileSync(join(fixturesDir, name), 'utf8')
      }

      const vitePluginImport = "import conciv from '@conciv/it/plugin/vite'"

      const webpackModule = '@conciv/it/plugin/webpack'

      function addConciv(source: string) {
        return addToPluginsArray(source, 'conciv', '@conciv/it/plugin/vite', 'conciv()', {importStyle: 'default'})
      }

      function addConcivRequire(source: string) {
        return addToPluginsArrayRequire(source, 'conciv', webpackModule, 'conciv.default()')
      }

      function viteWired(source: string): boolean {
        return pluginCallWired(source, '@conciv/it/plugin/vite', 'conciv()', {importStyle: 'default'})
      }

      function webpackRequireWired(source: string): boolean {
        return pluginCallWired(source, webpackModule, 'conciv.default()', {importStyle: 'require'})
      }

      function preservedLines(source: string, marker: string): string[] {
        return source.split('\n').filter((line) => !line.includes(marker))
      }

      const matchedViteFixtures = [
        {name: 'vite.config.react.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.vanilla.ts', appended: 'plugins: [conciv()]'},
        {name: 'vite.config.solid-start.ts', appended: 'nitro(),\n    conciv(),\n  ]'},
        {name: 'vite.config.svelte.ts', appended: '}),\n    conciv(),\n  ]'},
        {name: 'vite.config.tanstack-start.ts', appended: 'viteReact(),\n    conciv(),\n  ]'},
        {name: 'astro.config.mjs', appended: 'plugins: [conciv()]'},
        {name: 'vite.config.spread.ts', appended: 'plugins: [...base, react(), conciv()]'},
        {name: 'vite.config.function.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.arrow.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.async-arrow.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.function-body.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.async-function-body.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.bare-object.ts', appended: 'plugins: [react(), conciv()]'},
        {name: 'vite.config.bare-arrow.ts', appended: 'plugins: [react(), conciv()]'},
      ]

      describe('addToPluginsArray', () => {
        it.each(matchedViteFixtures)('appends conciv() and the default import in $name', ({name, appended}) => {
          const source = fixture(name)
          const result = addConciv(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain(vitePluginImport)
          expect(result.output).toContain(appended)
          const outputLines = result.output.split('\n')
          for (const line of preservedLines(source, 'plugins')) {
            expect(outputLines).toContain(line)
          }
        })

        it.each(matchedViteFixtures)('is idempotent over its own output for $name', ({name}) => {
          const first = addConciv(fixture(name))
          if (first.output === null) throw new Error('matched transform must carry output')
          const second = addConciv(first.output)
          expect(second.matched).toBe(true)
          expect(second.output).toBe(first.output)
        })

        it('refuses a config without a plugins array', () => {
          expect(addConciv(fixture('vite.config.no-plugins.ts'))).toEqual({matched: false, output: null})
        })

        it('refuses a config function whose returned object it cannot prove', () => {
          expect(addConciv(fixture('vite.config.function-conditional.ts'))).toEqual({matched: false, output: null})
          expect(addConciv(fixture('vite.config.function-variable.ts'))).toEqual({matched: false, output: null})
        })

        it('refuses a plugins array that is not part of the exported config', () => {
          expect(addConciv(fixture('vite.config.foreign-plugins.ts'))).toEqual({matched: false, output: null})
        })

        it('adds the missing call when only the plugin import is present', () => {
          const source = fixture('vite.config.import-only.ts')
          const result = addConciv(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain('plugins: [conciv()]')
          expect(result.output.split(vitePluginImport)).toHaveLength(2)
        })

        it('adds the missing call when only the plugin require is present', () => {
          const source = fixture('webpack.config.cjs-require-only.js')
          const result = addConcivRequire(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain('plugins: [conciv.default()]')
          expect(result.output.split("require('@conciv/it/plugin/webpack')")).toHaveLength(2)
        })

        it('supports named import style', () => {
          const result = addToPluginsArray(
            fixture('vite.config.react.ts'),
            'conciv',
            '@conciv/it/plugin/vite',
            'conciv()',
            {
              importStyle: 'named',
            },
          )
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain("import {conciv} from '@conciv/it/plugin/vite'")
        })
      })

      describe('pluginCallWired', () => {
        it('is false while only the import is present and true once the call lands', () => {
          const source = fixture('vite.config.import-only.ts')
          expect(viteWired(source)).toBe(false)
          const result = addConciv(source)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(viteWired(result.output)).toBe(true)
        })

        it('is false while only the require is present and true once the call lands', () => {
          const source = fixture('webpack.config.cjs-require-only.js')
          expect(webpackRequireWired(source)).toBe(false)
          const result = addConcivRequire(source)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(webpackRequireWired(result.output)).toBe(true)
        })

        it('is false for a plugins array outside the exported config', () => {
          expect(viteWired(fixture('vite.config.foreign-plugins.ts'))).toBe(false)
        })
      })

      describe('binding provenance', () => {
        it('refuses a config that imports something else from the plugin module', () => {
          expect(addConciv(fixture('vite.config.foreign-import.ts'))).toEqual({matched: false, output: null})
        })

        it('refuses a conciv() call bound to another module and does not read it as wired', () => {
          const source = fixture('vite.config.foreign-binding.ts')
          expect(viteWired(source)).toBe(false)
          expect(addConciv(source)).toEqual({matched: false, output: null})
        })

        it('refuses an aliased named import that shadows the default binding name', () => {
          const source = fixture('vite.config.aliased-import.ts')
          expect(viteWired(source)).toBe(false)
          expect(addConciv(source)).toEqual({matched: false, output: null})
        })

        it('refuses a namespace import where the default import is expected', () => {
          const source = fixture('vite.config.namespace-import.ts')
          expect(viteWired(source)).toBe(false)
          expect(addConciv(source)).toEqual({matched: false, output: null})
        })

        it('wires a config whose only reference to the plugin module is a type-only import', () => {
          const result = addConciv(fixture('vite.config.type-import.ts'))
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain(vitePluginImport)
          expect(result.output).toContain('plugins: [conciv()]')
          expect(viteWired(result.output)).toBe(true)
        })

        it('refuses a CJS config that destructures something else out of the plugin require', () => {
          expect(addConcivRequire(fixture('webpack.config.cjs-foreign-require.js'))).toEqual({
            matched: false,
            output: null,
          })
        })

        it('refuses a CJS conciv.default() call bound to another require', () => {
          const source = fixture('webpack.config.cjs-foreign-binding.js')
          expect(webpackRequireWired(source)).toBe(false)
          expect(addConcivRequire(source)).toEqual({matched: false, output: null})
        })

        it('refuses a require nested in a function as provenance for a top-level conciv.default() call', () => {
          const source = fixture('webpack.config.cjs-nested-require.js')
          expect(webpackRequireWired(source)).toBe(false)
          expect(addConcivRequire(source)).toEqual({matched: false, output: null})
        })

        it('refuses require-call provenance in a CJS config that rebinds require itself', () => {
          const source = fixture('webpack.config.cjs-shadowed-require.js')
          expect(webpackRequireWired(source)).toBe(false)
          expect(addConcivRequire(source)).toEqual({matched: false, output: null})
        })

        it('refuses require-call provenance in a CJS config that destructures require out of an object', () => {
          const source = fixture('webpack.config.cjs-destructured-require.js')
          expect(webpackRequireWired(source)).toBe(false)
          expect(addConcivRequire(source)).toEqual({matched: false, output: null})
        })

        it('refuses require-call provenance in a CJS config that reassigns require', () => {
          const source = fixture('webpack.config.cjs-reassigned-require.js')
          expect(webpackRequireWired(source)).toBe(false)
          expect(addConcivRequire(source)).toEqual({matched: false, output: null})
        })

        it('still wires a CJS config that only reads require.resolve', () => {
          const source = fixture('webpack.config.cjs-require-resolve.js')
          expect(webpackRequireWired(source)).toBe(false)
          const result = addConcivRequire(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain("const conciv = require('@conciv/it/plugin/webpack')")
          expect(result.output).toContain('plugins: [conciv.default()]')
          expect(webpackRequireWired(result.output)).toBe(true)
        })

        it('refuses a next config that imports something else from the plugin module', () => {
          const source = fixture('next.config.foreign-import.ts')
          expect(defaultExportWrapped(source, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(false)
          expect(wrapConciv(source)).toEqual({matched: false, output: null})
        })

        it('refuses a withConciv wrapper bound to another module', () => {
          const source = fixture('next.config.foreign-wrapper.ts')
          expect(defaultExportWrapped(source, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(false)
          expect(wrapConciv(source)).toEqual({matched: false, output: null})
        })
      })

      const nextPluginImport = "import {withConciv} from '@conciv/it/plugin/nextjs'"

      function wrapConciv(source: string) {
        return wrapDefaultExport(source, 'withConciv', '@conciv/it/plugin/nextjs')
      }

      const wrapFixtures = [
        {name: 'next.config.ts', wrapped: 'export default withConciv(nextConfig)'},
        {name: 'next.config.wrapped.ts', wrapped: 'export default withConciv(withSentry(nextConfig))'},
        {name: 'next.config.mjs-default.mjs', wrapped: 'export default withConciv(nextConfig)'},
      ]

      describe('wrapDefaultExport', () => {
        it.each(wrapFixtures)('wraps the default export of $name', ({name, wrapped}) => {
          const source = fixture(name)
          const result = wrapConciv(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain(nextPluginImport)
          expect(result.output).toContain(wrapped)
          const outputLines = result.output.split('\n')
          for (const line of preservedLines(source, 'export default')) {
            expect(outputLines).toContain(line)
          }
        })

        it.each(wrapFixtures)('is idempotent over its own output for $name', ({name}) => {
          const first = wrapConciv(fixture(name))
          if (first.output === null) throw new Error('matched transform must carry output')
          const second = wrapConciv(first.output)
          expect(second.matched).toBe(true)
          expect(second.output).toBe(first.output)
        })

        it('wraps the export when only the wrapper import is present', () => {
          const source = fixture('next.config.import-only.ts')
          const result = wrapConciv(source)
          expect(result.matched).toBe(true)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(result.output).toContain('export default withConciv(nextConfig)')
          expect(result.output.split(nextPluginImport)).toHaveLength(2)
        })
      })

      describe('defaultExportWrapped', () => {
        it('is false while only the import is present and true once the export is wrapped', () => {
          const source = fixture('next.config.import-only.ts')
          expect(defaultExportWrapped(source, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(false)
          const result = wrapConciv(source)
          if (result.output === null) throw new Error('matched transform must carry output')
          expect(defaultExportWrapped(result.output, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(true)
        })
      })
    })

    describe('nextjs', () => {
      const fixturesDir = join(import.meta.dirname, 'fixtures')

      const instrumentationContent = "export {register} from '@conciv/it/plugin/nextjs'\n"
      const clientContent = "import '@conciv/it/plugin/nextjs/widget'\n"

      function project(fixtureName: string | null): {cwd: string; detected: Detected} & ReturnType<typeof stepContext> {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-nextjs-'))
        writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: 'app', dependencies: {next: '^15.0.0'}}))
        const configFile = fixtureName === null ? null : 'next.config.ts'
        if (fixtureName !== null) {
          writeFileSync(join(cwd, 'next.config.ts'), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
        }
        const detected: Detected = {framework: 'nextjs', configFile, packageManager: 'pnpm'}
        return {cwd, detected, ...stepContext(cwd)}
      }

      describe('nextjsStep', () => {
        it('lands all three wires on a fresh project with exact instrumentation contents', async () => {
          const {cwd, detected, events, settings, output, ctx} = project('next.config.ts')
          const step = nextjsStep(detected)
          expect(step.id).toBe('framework')
          expect(await step.detect(ctx)).toBe('missing')
          const ledger = await runSteps([step], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          expect(config).toContain("import {withConciv} from '@conciv/it/plugin/nextjs'")
          expect(config).toContain('export default withConciv(nextConfig)')
          expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
          expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
          expect(await step.detect(ctx)).toBe('present')
          expect(await step.verify(ctx)).toBe(true)
          expect(events).toContain('line:created instrumentation.ts')
          const diff = events.filter((event) => event.startsWith('note:next.config.ts:')).join('\n')
          expect(diff).toContain('--- next.config.ts')
          expect(diff).toContain('+export default withConciv(nextConfig)')
        })

        it('reports already on the second run through the pipeline', async () => {
          const {detected, settings, output} = project('next.config.ts')
          const first = await runSteps([nextjsStep(detected)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['done'])
          const second = await runSteps([nextjsStep(detected)], settings, output)
          expect(second.map((entry) => entry.status)).toEqual(['already'])
        })

        it('cards a pre-existing custom instrumentation.ts while the other wires still land', async () => {
          const {cwd, detected, settings, output} = project('next.config.ts')
          const custom = "export function register() {\n  console.log('mine')\n}\n"
          writeFileSync(join(cwd, 'instrumentation.ts'), custom)
          const ledger = await runSteps([nextjsStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          const entry = ledger[0]
          if (!entry) throw new Error('expected a ledger entry')
          expect(entry.cards).toHaveLength(1)
          expect(entry.cards[0]?.title).toContain('instrumentation.ts')
          expect(entry.cards[0]?.snippet).toBe("export {register} from '@conciv/it/plugin/nextjs'")
          expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(custom)
          const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          expect(config).toContain('export default withConciv(nextConfig)')
          expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
        })

        it('re-runs only the remaining wires when the config is already wrapped', async () => {
          const {cwd, detected, settings, output, ctx} = project('next.config.ts')
          const first = await runSteps([nextjsStep(detected)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['done'])
          const wiredConfig = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          writeFileSync(join(cwd, 'instrumentation-client.ts'), '')
          const step = nextjsStep(detected)
          expect(await step.detect(ctx)).toBe('missing')
          const outcome = await step.apply(ctx)
          expect(outcome.status).toBe('manual')
          expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(wiredConfig)
          expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
        })

        it('wraps a foreign-wrapped config outside-in', async () => {
          const {cwd, detected, settings, output} = project('next.config.wrapped.ts')
          const ledger = await runSteps([nextjsStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          expect(config).toContain('export default withConciv(withSentry(nextConfig))')
        })

        it('treats a lone withConciv import as unwired and wraps the export', async () => {
          const {cwd, detected, settings, output, ctx} = project('next.config.import-only.ts')
          const step = nextjsStep(detected)
          expect(await step.detect(ctx)).toBe('missing')
          const ledger = await runSteps([step], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toContain('export default withConciv(nextConfig)')
          expect(await step.verify(ctx)).toBe(true)
        })

        it('cards a config that imports something else from the plugin module and leaves it alone', async () => {
          const {cwd, detected, settings, output} = project('next.config.foreign-import.ts')
          const before = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          const ledger = await runSteps([nextjsStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(ledger[0]?.cards.map((card) => card.title)).toEqual(['Wrap your next config'])
          expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(before)
        })

        it('cards a withConciv wrapper bound to another module instead of reading it as wired', async () => {
          const {cwd, detected, settings, output, ctx} = project('next.config.foreign-wrapper.ts')
          const before = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          expect(await nextjsStep(detected).detect(ctx)).toBe('missing')
          const ledger = await runSteps([nextjsStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(ledger[0]?.cards.map((card) => card.title)).toEqual(['Wrap your next config'])
          expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(before)
        })

        it('cards the config wire when there is no config file and still writes instrumentation', async () => {
          const {cwd, detected, settings, output} = project(null)
          const ledger = await runSteps([nextjsStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(ledger[0]?.cards).toHaveLength(1)
          expect(ledger[0]?.cards[0]?.title).toContain('config')
          expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
          expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
        })

        it('dry-run plans without touching anything', async () => {
          const {cwd, detected, events, settings, output} = project('next.config.ts')
          const before = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
          const ledger = await runSteps([nextjsStep(detected)], {...settings, dryRun: true}, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
          expect(events.join('\n')).toContain('next.config.ts')
          expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(before)
          expect(existsSync(join(cwd, 'instrumentation.ts'))).toBe(false)
          expect(existsSync(join(cwd, 'instrumentation-client.ts'))).toBe(false)
        })
      })
    })

    describe('vite', () => {
      const fixturesDir = join(import.meta.dirname, 'fixtures')

      const quickStartSnippet = `import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`

      function project(fixtureName: string | null): {cwd: string; detected: Detected} & ReturnType<typeof stepContext> {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-vite-'))
        writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: 'app', devDependencies: {vite: '^7.0.0'}}))
        const configFile = fixtureName === null ? null : 'vite.config.ts'
        if (fixtureName !== null) {
          writeFileSync(join(cwd, 'vite.config.ts'), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
        }
        const detected: Detected = {framework: 'vite', configFile, packageManager: 'pnpm'}
        return {cwd, detected, ...stepContext(cwd)}
      }

      describe('viteStep', () => {
        it('applies onto the vite-react fixture, reports a unified diff, and flips detect to present', async () => {
          const {cwd, detected, notes, backups, ctx} = project('vite.config.react.ts')
          const step = viteStep(detected)
          expect(step.id).toBe('framework')
          expect(await step.detect(ctx)).toBe('missing')
          expect(await step.apply(ctx)).toEqual({status: 'done'})
          const written = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          expect(written).toContain("import conciv from '@conciv/it/plugin/vite'")
          expect(written).toContain('plugins: [react(), conciv()]')
          expect(await step.detect(ctx)).toBe('present')
          expect(await step.verify(ctx)).toBe(true)
          expect(backups).toEqual([
            {
              path: join(cwd, 'vite.config.ts'),
              content: readFileSync(join(fixturesDir, 'vite.config.react.ts'), 'utf8'),
            },
          ])
          expect(notes.map((note) => note.title)).toEqual(['vite.config.ts'])
          const diff = notes.map((note) => note.body).join('\n')
          expect(diff).toContain('--- vite.config.ts')
          expect(diff).toContain('+++ vite.config.ts')
          expect(diff).toContain('-  plugins: [react()],')
          expect(diff).toContain('+  plugins: [react(), conciv()],')
          expect(diff).toContain("+import conciv from '@conciv/it/plugin/vite'")
        })

        it('reports already on the second run through the pipeline', async () => {
          const {detected, settings, output} = project('vite.config.react.ts')
          const first = await runSteps([viteStep(detected)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['done'])
          const second = await runSteps([viteStep(detected)], settings, output)
          expect(second.map((entry) => entry.status)).toEqual(['already'])
        })

        it('cards the no-plugins fixture with exactly the quick-start snippet and leaves the file alone', async () => {
          const {cwd, detected, settings, output} = project('vite.config.no-plugins.ts')
          const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          const ledger = await runSteps([viteStep(detected)], settings, output)
          expect(ledger).toEqual([
            {
              id: 'framework',
              title: 'Wire the vite config',
              status: 'manual',
              cards: [
                {
                  title: 'Wire the conciv vite plugin',
                  body: 'conciv could not prove the shape of your vite config. Add the plugin yourself. Full steps: https://conciv.dev/docs/quick-start/vite',
                  snippet: quickStartSnippet,
                },
              ],
            },
          ])
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
        })

        it('cards a config whose only plugins array sits outside the export and leaves the file alone', async () => {
          const {cwd, detected, settings, output} = project('vite.config.foreign-plugins.ts')
          const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          const ledger = await runSteps([viteStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(ledger[0]?.cards[0]?.snippet).toBe(quickStartSnippet)
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
        })

        it('treats a lone plugin import as unwired and lands the call', async () => {
          const {cwd, detected, ctx} = project('vite.config.import-only.ts')
          const step = viteStep(detected)
          expect(await step.detect(ctx)).toBe('missing')
          expect(await step.apply(ctx)).toEqual({status: 'done'})
          const written = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          expect(written).toContain('plugins: [conciv()]')
          expect(await step.verify(ctx)).toBe(true)
        })

        it('cards a config that imports something else from the plugin module and leaves the file alone', async () => {
          const {cwd, detected, settings, output} = project('vite.config.foreign-import.ts')
          const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          const ledger = await runSteps([viteStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(ledger[0]?.cards[0]?.snippet).toBe(quickStartSnippet)
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
        })

        it('cards a conciv() call bound to another module instead of reading it as wired', async () => {
          const {cwd, detected, ctx, settings, output} = project('vite.config.foreign-binding.ts')
          const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          expect(await viteStep(detected).detect(ctx)).toBe('missing')
          const ledger = await runSteps([viteStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
        })

        it('cards when the project has no config file', async () => {
          const {detected, ctx} = project(null)
          const outcome = await viteStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards[0]?.snippet).toBe(quickStartSnippet)
        })

        it('dry-run plans without touching the file', async () => {
          const {cwd, detected, events, settings, output} = project('vite.config.react.ts')
          const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          const ledger = await runSteps([viteStep(detected)], {...settings, dryRun: true}, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
          expect(events.join('\n')).toContain('vite.config.ts')
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
        })

        it('remembers the original config so an interrupted run can restore it', async () => {
          const {cwd, detected, backups, ctx} = project('vite.config.react.ts')
          const original = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
          expect(await viteStep(detected).apply(ctx)).toEqual({status: 'done'})
          expect(backups).toEqual([{path: join(cwd, 'vite.config.ts'), content: original}])
          expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).not.toBe(original)
        })
      })
    })

    describe('webpack family', () => {
      const fixturesDir = join(import.meta.dirname, 'fixtures')

      type Project = {cwd: string; detected: Detected} & ReturnType<typeof stepContext>

      function project(framework: Framework, configFile: string | null, fixtureName: string | null): Project {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-webpack-family-'))
        writeFileSync(
          join(cwd, 'package.json'),
          JSON.stringify({name: 'app', devDependencies: {[framework]: '^1.0.0'}}),
        )
        if (configFile !== null && fixtureName !== null) {
          writeFileSync(join(cwd, configFile), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
        }
        const detected: Detected = {framework, configFile, packageManager: 'pnpm'}
        return {cwd, detected, ...stepContext(cwd)}
      }

      async function unwiredCardTitles(detected: Detected, ctx: Project['ctx']): Promise<string[]> {
        const step = webpackFamilyStep(detected)
        expect(await step.detect(ctx)).toBe('missing')
        const outcome = await step.apply(ctx)
        if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
        return outcome.cards.map((card) => card.title)
      }

      const untrustedConfigs = [
        {
          reason: 'destructures something else out of the plugin require',
          fixtureName: 'webpack.config.cjs-foreign-require.js',
        },
        {reason: 'binds conciv.default() to another require', fixtureName: 'webpack.config.cjs-foreign-binding.js'},
        {reason: 'hides the plugin require inside a function', fixtureName: 'webpack.config.cjs-nested-require.js'},
        {reason: 'redeclares require itself', fixtureName: 'webpack.config.cjs-shadowed-require.js'},
        {reason: 'destructures require out of an object', fixtureName: 'webpack.config.cjs-destructured-require.js'},
        {reason: 'reassigns require', fixtureName: 'webpack.config.cjs-reassigned-require.js'},
      ]

      describe('webpackFamilyStep', () => {
        it('wires a CJS webpack config with a require line and conciv.default(), still carding widgetUrl', async () => {
          const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.cjs.js')
          const step = webpackFamilyStep(detected)
          expect(step.id).toBe('framework')
          expect(await step.detect(ctx)).toBe('missing')
          const outcome = await step.apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards.map((card) => card.title)).toEqual(['Inject the widget'])
          expect(outcome.cards[0]?.body).toContain('@conciv/widget/global')
          expect(outcome.cards[0]?.body).toContain('widgetUrl')
          const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          expect(written).toContain("const conciv = require('@conciv/it/plugin/webpack')")
          expect(written).toContain('plugins: [new DefinePlugin({DEV: true}), conciv.default()],')
          expect(await step.detect(ctx)).toBe('present')
        })

        it('reports already on the second pipeline run over a wired CJS config', async () => {
          const {detected, settings, output} = project('webpack', 'webpack.config.js', 'webpack.config.cjs.js')
          const first = await runSteps([webpackFamilyStep(detected)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['manual'])
          const second = await runSteps([webpackFamilyStep(detected)], settings, output)
          expect(second.map((entry) => entry.status)).toEqual(['already'])
        })

        it('wires an ESM webpack config through the engine with a default import', async () => {
          const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.esm.js')
          const outcome = await webpackFamilyStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards.map((card) => card.title)).toEqual(['Inject the widget'])
          const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          expect(written).toContain("import conciv from '@conciv/it/plugin/webpack'")
          expect(written).toContain('plugins: [new TerserPlugin(), conciv()],')
        })

        it('treats an ESM config that only mentions module.exports in a string as ESM', async () => {
          const {cwd, detected, ctx} = project(
            'webpack',
            'webpack.config.js',
            'webpack.config.esm-mentions-module-exports.js',
          )
          expect(await unwiredCardTitles(detected, ctx)).toEqual(['Inject the widget'])
          const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          expect(written).toContain("import conciv from '@conciv/it/plugin/webpack'")
          expect(written).toContain('conciv()')
          expect(written).not.toContain('require(')
          expect(await webpackFamilyStep(detected).detect(ctx)).toBe('present')
        })

        it('cards a config that mixes both module styles instead of guessing one', async () => {
          const {cwd, detected, ctx} = project(
            'webpack',
            'webpack.config.js',
            'webpack.config.ambiguous-both-styles.js',
          )
          const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          expect(await unwiredCardTitles(detected, ctx)).toEqual([
            'Wire the conciv webpack plugin',
            'Inject the widget',
          ])
          expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
        })

        it('picks the rspack module path for rspack projects', async () => {
          const {cwd, detected, ctx} = project('rspack', 'rspack.config.js', 'rspack.config.esm.js')
          const outcome = await webpackFamilyStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          const written = readFileSync(join(cwd, 'rspack.config.js'), 'utf8')
          expect(written).toContain("import conciv from '@conciv/it/plugin/rspack'")
          expect(written).toContain('plugins: [conciv()],')
          expect(outcome.cards[0]?.body).toContain('rspack')
        })

        it('treats a lone plugin require as unwired and lands the call', async () => {
          const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.cjs-require-only.js')
          const step = webpackFamilyStep(detected)
          expect(await step.detect(ctx)).toBe('missing')
          const outcome = await step.apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          expect(written).toContain('plugins: [conciv.default()]')
          expect(await step.detect(ctx)).toBe('present')
        })

        for (const {reason, fixtureName} of untrustedConfigs) {
          it(`cards a CJS config that ${reason} and leaves the file byte-identical`, async () => {
            const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', fixtureName)
            const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
            expect(await unwiredCardTitles(detected, ctx)).toEqual([
              'Wire the conciv webpack plugin',
              'Inject the widget',
            ])
            expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
          })
        }

        it('cards a CJS config without a plugins array and leaves the file byte-identical', async () => {
          const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.cjs-no-plugins.js')
          const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          const outcome = await webpackFamilyStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards.map((card) => card.title)).toEqual([
            'Wire the conciv webpack plugin',
            'Inject the widget',
          ])
          expect(outcome.cards[0]?.snippet).toBe(`const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  plugins: [conciv.default()],
}`)
          expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
        })

        it('cards when the project has no config file', async () => {
          const {detected, ctx} = project('rspack', null, null)
          const outcome = await webpackFamilyStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards.map((card) => card.title)).toEqual([
            'Wire the conciv rspack plugin',
            'Inject the widget',
          ])
          expect(outcome.cards[0]?.snippet).toContain("require('@conciv/it/plugin/rspack')")
        })

        it('dry-run plans without touching the file', async () => {
          const {cwd, detected, events, settings, output} = project(
            'webpack',
            'webpack.config.js',
            'webpack.config.cjs.js',
          )
          const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
          const ledger = await runSteps([webpackFamilyStep(detected)], {...settings, dryRun: true}, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
          expect(events.join('\n')).toContain('webpack.config.js')
          expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
        })
      })

      describe('fallbackStep', () => {
        it('cards a rollup project with the build-only caveat and writes nothing', async () => {
          const {cwd, detected, settings, output} = project('rollup', 'rollup.config.mjs', 'rollup.config.basic.mjs')
          const filesBefore = readdirSync(cwd).toSorted()
          const configBefore = readFileSync(join(cwd, 'rollup.config.mjs'), 'utf8')
          const ledger = await runSteps([fallbackStep(detected)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          const card = ledger[0]?.cards[0]
          expect(card?.body).toContain('@conciv/it/plugin/rollup')
          expect(card?.body).toContain('build-only no-op')
          expect(card?.body).toContain('Vite uses Rollup under the hood')
          expect(readdirSync(cwd).toSorted()).toEqual(filesBefore)
          expect(readFileSync(join(cwd, 'rollup.config.mjs'), 'utf8')).toBe(configBefore)
        })

        it('cards an esbuild project with the build-only caveat', async () => {
          const {detected, ctx} = project('esbuild', null, null)
          const outcome = await fallbackStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards[0]?.body).toContain('@conciv/it/plugin/esbuild')
          expect(outcome.cards[0]?.body).toContain('build-only no-op')
        })

        it('cards an unknown project with the vite quick-start snippet', async () => {
          const {cwd, detected, ctx} = project('unknown', null, null)
          const filesBefore = readdirSync(cwd).toSorted()
          const outcome = await fallbackStep(detected).apply(ctx)
          if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
          expect(outcome.cards[0]?.snippet).toBe(`import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`)
          expect(readdirSync(cwd).toSorted()).toEqual(filesBefore)
        })
      })
    })
  })

  describe('harness', () => {
    describe('agents md', () => {
      const consented: HarnessId[] = ['claude', 'codex']

      function project(): {cwd: string} & ReturnType<typeof stepContext> {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-agents-'))
        return {cwd, ...stepContext(cwd)}
      }

      describe('agentsSection', () => {
        it('leads with the cli ranking and command table before the mcp sandbox path', () => {
          const section = agentsSection(consented)
          const ranking = section.indexOf('This project has conciv installed.')
          const table = section.indexOf('### When to use conciv instead of the browser MCP')
          const sandbox = section.indexOf('`discover_tools`')
          expect(ranking).toBeGreaterThan(section.indexOf('## conciv'))
          expect(table).toBeGreaterThan(ranking)
          expect(sandbox).toBeGreaterThan(table)
          expect(section).toContain('`.conciv/bin/conciv tools page snapshot`')
          expect(section).toContain('`.conciv/bin/conciv tools react inspect <selector>`')
          expect(section).toContain('`.conciv/bin/conciv tools server graph|transform|reload`')
          expect(section).toContain('`.conciv/bin/conciv tools --help`')
        })

        it('writes every command so it runs as written, without conciv on PATH', () => {
          expect(agentsSection(consented)).not.toMatch(/`conciv /)
          expect(agentsSection([])).not.toMatch(/`conciv /)
        })

        it('shares the command table text with the claude plugin skill', () => {
          const skill = claudeConnectPluginFiles({stateDir: '/project/.conciv'}).find((file) =>
            file.path.endsWith(join('skills', 'conciv', 'SKILL.md')),
          )
          const [, tail = ''] = agentsSection(consented).split('### When to use conciv instead of the browser MCP')
          const table = tail.split('\n\n').slice(1, 3).join('\n\n')
          expect(table).toContain('`.conciv/bin/conciv tools page console`')
          expect(skill?.contents).toContain(table)
        })

        it('omits the "Set up for" line and explains no harness connected when consented is empty', () => {
          const section = agentsSection([])
          expect(section).not.toContain('Set up for:')
          expect(section).toContain('No harness was connected')
          expect(section).toContain('re-run `npx @conciv/cli@latest init`')
        })
      })

      describe('agentsMdStep', () => {
        it('creates AGENTS.md with exactly the marked section on a fresh project', async () => {
          const {cwd, settings, output} = project()
          const step = agentsMdStep(() => consented)
          expect(step.id).toBe('agents')
          const ledger = await runSteps([step], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
          expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
        })

        it('creates no CLAUDE.md when the claude harness was not consented', async () => {
          const {cwd, settings, output} = project()
          const ledger = await runSteps([agentsMdStep(() => ['codex'])], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          expect(existsSync(join(cwd, 'CLAUDE.md'))).toBe(false)
        })

        it('keeps a CLAUDE.md that imports AGENTS.md as the bare import across runs', async () => {
          const {cwd, settings, output} = project()
          const first = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['done'])
          const second = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(second.map((entry) => entry.status)).toEqual(['already'])
          expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
        })

        it('appends to an existing AGENTS.md keeping the surrounding text byte-identical', async () => {
          const {cwd, settings, output} = project()
          const original = '# my project\n\nhand-written rules stay put.\n'
          writeFileSync(join(cwd, 'AGENTS.md'), original)
          const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
          expect(written.startsWith(original)).toBe(true)
          expect(written).toBe(`${original}\n${agentsSection(consented)}\n`)
        })

        it('replaces a stale marked section in place, preserving text outside the markers', async () => {
          const {cwd, settings, output} = project()
          const before = '# intro\n\n'
          const after = '\n\n# outro\n'
          const stale = '<!-- conciv:start -->\nold copy from an older conciv\n<!-- conciv:end -->'
          writeFileSync(join(cwd, 'AGENTS.md'), `${before}${stale}${after}`)
          const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${before}${agentsSection(consented)}${after}`)
        })

        it('mirrors the section into CLAUDE.md only when that file already exists', async () => {
          const {cwd, settings, output} = project()
          const claude = '# claude notes\n'
          writeFileSync(join(cwd, 'CLAUDE.md'), claude)
          const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(`${claude}\n${agentsSection(consented)}\n`)
          expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
        })

        it('reports already on the second run without editing', async () => {
          const {cwd, settings, output} = project()
          const first = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(first.map((entry) => entry.status)).toEqual(['done'])
          const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
          const second = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(second.map((entry) => entry.status)).toEqual(['already'])
          expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(written)
        })

        it('never eats the text under a stray start marker, however many times init runs', async () => {
          const {cwd, settings, output} = project()
          const strayed = ['# my project', '', '<!-- conciv:start -->', '', 'hand-written rules stay put.', ''].join(
            '\n',
          )
          writeFileSync(join(cwd, 'AGENTS.md'), strayed)
          const runOnce = async (): Promise<void> => {
            const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
            expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
            expect(ledger[0]?.cards[0]?.snippet).toBe(agentsSection(consented))
            expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(strayed)
          }
          await runOnce()
          await runOnce()
          await runOnce()
        })

        it('refuses a file carrying two conciv blocks instead of merging them into one span', async () => {
          const {cwd, settings, output} = project()
          const doubled = [
            agentsSection([]),
            '',
            'user notes between the blocks',
            '',
            agentsSection(consented),
            '',
          ].join('\n')
          writeFileSync(join(cwd, 'AGENTS.md'), doubled)
          const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(doubled)
        })

        it('offers the section text itself as the manual card snippet', () => {
          const {ctx} = project()
          const card = agentsMdStep(() => consented).manualCard(ctx)
          expect(card.snippet).toBe(agentsSection(consented))
        })
      })
    })

    describe('claude', () => {
      const INSTALL_COMMAND = 'claude plugin install conciv-connect@conciv --scope local'

      type Fixture = {
        cwd: string
        home: string
        recordFile: string
        harness: ReturnType<typeof stepContext>
        io: HarnessInitIo
      }

      function shimScript(): string {
        return [
          '#!/bin/sh',
          'printf \'%s\\n\' "$*" >> "$CONCIV_CLAUDE_RECORD"',
          '[ "$CONCIV_CLAUDE_EXIT" = "0" ] || exit "$CONCIV_CLAUDE_EXIT"',
          'PLUGINS="$HOME/.claude/plugins"',
          'CACHE="$PLUGINS/cache/conciv/conciv-connect/0.0.0"',
          'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "add" ]; then',
          '  mkdir -p "$PLUGINS"',
          '  printf \'%s\' "$4" > "$PLUGINS/conciv-source"',
          '  printf \'{"conciv":{"installLocation":"%s"}}\' "$4" > "$PLUGINS/known_marketplaces.json"',
          'fi',
          'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then',
          '  ROOT=$(cat "$PLUGINS/conciv-source")',
          '  mkdir -p "$CACHE"',
          '  cp -R "$ROOT/conciv-connect/." "$CACHE/"',
          '  printf \'{"version":2,"plugins":{"conciv-connect@conciv":[{"scope":"local","version":"0.0.0","installPath":"%s","projectPath":"%s"}]}}\' "$CACHE" "$PWD" > "$PLUGINS/installed_plugins.json"',
          'fi',
          'exit 0',
          '',
        ].join('\n')
      }

      function claudeIo(opts: {home: string; binDir: string; recordFile: string; exitCode: number}): HarnessInitIo {
        return {
          home: opts.home,
          run: (bin, args, cwd, onLine) =>
            execFileOutcome(
              bin,
              args,
              {
                cwd,
                env: {
                  ...process.env,
                  PATH: `${opts.binDir}${delimiter}${process.env.PATH ?? ''}`,
                  HOME: opts.home,
                  CONCIV_CLAUDE_RECORD: opts.recordFile,
                  CONCIV_CLAUDE_EXIT: String(opts.exitCode),
                },
              },
              onLine,
            ),
        }
      }

      function fixture(opts: {exitCode: number; cwdPrefix?: string}): Fixture {
        const cwd = mkdtempSync(join(tmpdir(), opts.cwdPrefix ?? 'conciv-claude-step-'))
        const home = mkdtempSync(join(tmpdir(), 'conciv-claude-home-'))
        const binDir = join(home, 'shim-bin')
        const recordFile = join(home, 'claude-argv.log')
        mkdirSync(binDir, {recursive: true})
        const shim = join(binDir, 'claude')
        writeFileSync(shim, shimScript())
        chmodSync(shim, 0o755)
        return {cwd, home, recordFile, harness: stepContext(cwd), io: claudeIo({home, binDir, recordFile, ...opts})}
      }

      function siblingProject(source: Fixture): Fixture {
        const cwd = mkdtempSync(join(tmpdir(), 'conciv-claude-other-'))
        return {...source, cwd, harness: stepContext(cwd)}
      }

      function pluginCacheDir(home: string): string {
        return join(home, '.claude', 'plugins', 'cache', 'conciv', 'conciv-connect', '0.0.0')
      }

      function connectFiles(stateDir: string): HarnessConnectFile[] {
        return claudeConnectPluginFiles({stateDir})
      }

      function writeTree(stateDir: string): void {
        for (const file of connectFiles(stateDir)) {
          mkdirSync(dirname(file.path), {recursive: true})
          writeFileSync(file.path, file.contents)
        }
      }

      function seedInstalled(opts: {home: string; cwd: string; marketplaceRoot?: string}): void {
        const stateDir = join(opts.cwd, '.conciv')
        writeTree(stateDir)
        const marketplaceRoot = opts.marketplaceRoot ?? claudeConnectDir(stateDir)
        const pluginRoot = join(claudeConnectDir(stateDir), 'conciv-connect')
        const cache = pluginCacheDir(opts.home)
        for (const file of connectFiles(stateDir)) {
          const step = relative(pluginRoot, file.path)
          if (step.startsWith('..')) continue
          const target = join(cache, step)
          mkdirSync(dirname(target), {recursive: true})
          writeFileSync(target, file.contents)
        }
        const plugins = join(opts.home, '.claude', 'plugins')
        mkdirSync(plugins, {recursive: true})
        writeFileSync(
          join(plugins, 'installed_plugins.json'),
          JSON.stringify({
            version: 2,
            plugins: {
              'conciv-connect@conciv': [{scope: 'local', version: '0.0.0', installPath: cache, projectPath: opts.cwd}],
            },
          }),
        )
        writeFileSync(
          join(plugins, 'known_marketplaces.json'),
          JSON.stringify({conciv: {installLocation: marketplaceRoot}}),
        )
      }

      function recordedArgv(recordFile: string): string[] {
        if (!existsSync(recordFile)) return []
        return readFileSync(recordFile, 'utf8').trim().split('\n')
      }

      const claudeConsent: HarnessId[] = ['claude']

      describe('harnessInitStep(claudeInit)', () => {
        it('installs the connect plugin through the claude plugin manager with the exact argv sequence', async () => {
          const {cwd, recordFile, harness, io} = fixture({exitCode: 0})
          const step = harnessInitStep(claudeInit, () => claudeConsent, io)
          expect(step.id).toBe('claude')
          const ledger = await runSteps([step], harness.settings, harness.output)
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          const stateDir = join(cwd, '.conciv')
          expect(recordedArgv(recordFile)).toEqual([
            `plugin marketplace add ${claudeConnectDir(stateDir)}`,
            'plugin install conciv-connect@conciv --scope local',
          ])
          for (const file of connectFiles(stateDir)) {
            expect(readFileSync(file.path, 'utf8')).toBe(file.contents)
          }
        })

        it('writes an mcp manifest that names no dev server', async () => {
          const {cwd, harness, io} = fixture({exitCode: 0})
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, io)],
            harness.settings,
            harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          const manifest = join(claudeConnectDir(join(cwd, '.conciv')), 'conciv-connect', '.mcp.json')
          expect(readFileSync(manifest, 'utf8')).not.toContain('http')
        })

        it('cards out with the install commands when the claude cli exits non-zero', async () => {
          const {harness, io} = fixture({exitCode: 1})
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, io)],
            harness.settings,
            harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
          const cards = ledger[0]?.cards ?? []
          expect(cards).toHaveLength(1)
          expect(cards[0]?.snippet).toContain(INSTALL_COMMAND)
          expect(ledger[0]?.detail).toContain('claude plugin marketplace add')
        })

        it('quotes the marketplace path in the manual card so a directory with spaces pastes cleanly', async () => {
          const {cwd, harness, io} = fixture({exitCode: 1, cwdPrefix: 'conciv claude spaced '})
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, io)],
            harness.settings,
            harness.output,
          )
          const snippet = ledger[0]?.cards[0]?.snippet ?? ''
          expect(cwd).toContain(' ')
          expect(snippet).toContain(`claude plugin marketplace add '${claudeConnectDir(join(cwd, '.conciv'))}'`)
          expect(harness.ctx.cwd).toBe(cwd)
        })

        it('reports already when this project owns the recorded install', async () => {
          const project = fixture({exitCode: 0})
          seedInstalled({home: project.home, cwd: project.cwd})
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, project.io)],
            project.harness.settings,
            project.harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['already'])
          expect(existsSync(project.recordFile)).toBe(false)
        })

        it('stays already after a second project registers the marketplace from its own copy', async () => {
          const project = fixture({exitCode: 0})
          const other = siblingProject(project)
          writeTree(join(other.cwd, '.conciv'))
          seedInstalled({
            home: project.home,
            cwd: project.cwd,
            marketplaceRoot: claudeConnectDir(join(other.cwd, '.conciv')),
          })
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, project.io)],
            project.harness.settings,
            project.harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['already'])
          expect(existsSync(project.recordFile)).toBe(false)
        })

        it('installs for a second project even though the first project already installed the plugin', async () => {
          const first = fixture({exitCode: 0})
          const firstLedger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, first.io)],
            first.harness.settings,
            first.harness.output,
          )
          expect(firstLedger.map((entry) => entry.status)).toEqual(['done'])
          const second = siblingProject(first)
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => claudeConsent, second.io)],
            second.harness.settings,
            second.harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['done'])
          for (const file of connectFiles(join(second.cwd, '.conciv'))) {
            expect(readFileSync(file.path, 'utf8')).toBe(file.contents)
          }
          expect(recordedArgv(first.recordFile)).toEqual([
            `plugin marketplace add ${claudeConnectDir(join(first.cwd, '.conciv'))}`,
            'plugin install conciv-connect@conciv --scope local',
            `plugin marketplace add ${claudeConnectDir(join(second.cwd, '.conciv'))}`,
            'plugin install conciv-connect@conciv --scope local',
          ])
        })

        it('skips without spawning when claude is not in the consent record', async () => {
          const {recordFile, harness, io} = fixture({exitCode: 0})
          const ledger = await runSteps([harnessInitStep(claudeInit, () => [], io)], harness.settings, harness.output)
          expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
          expect(ledger[0]?.detail).toBe('not selected')
          expect(existsSync(recordFile)).toBe(false)
        })

        it('skips a deselected claude even when the plugin is already installed for this project', async () => {
          const project = fixture({exitCode: 0})
          seedInstalled({home: project.home, cwd: project.cwd})
          const ledger = await runSteps(
            [harnessInitStep(claudeInit, () => [], project.io)],
            project.harness.settings,
            project.harness.output,
          )
          expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
          expect(ledger[0]?.detail).toBe('not selected')
          expect(existsSync(project.recordFile)).toBe(false)
        })
      })
    })
  })

  describe('install it', () => {
    function project(manifest: object): InitContext {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-install-'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
      return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}, feed: () => {}}
    }

    describe('hasIt', () => {
      it('sees @conciv/it in dependencies', () => {
        expect(hasIt({dependencies: {'@conciv/it': '^0.0.17'}})).toBe(true)
      })
      it('sees @conciv/it in devDependencies', () => {
        expect(hasIt({devDependencies: {'@conciv/it': '^0.0.17'}})).toBe(true)
      })
      it('reports missing otherwise', () => {
        expect(hasIt({dependencies: {vite: '^7.0.0'}})).toBe(false)
        expect(hasIt({})).toBe(false)
      })
    })

    describe('installItStep', () => {
      it('detects present and missing from the real package.json', async () => {
        const step = installItStep(async () => {}, 'pnpm')
        expect(await step.detect(project({devDependencies: {'@conciv/it': '^0.0.17'}}))).toBe('present')
        expect(await step.detect(project({name: 'app'}))).toBe('missing')
      })

      it('apply with a recording add lands the dep, flips detect, and verifies', async () => {
        const ctx = project({name: 'app'})
        const step = installItStep(async (name, opts) => {
          const manifestPath = join(opts.cwd, 'package.json')
          writeFileSync(manifestPath, JSON.stringify({name: 'app', devDependencies: {[name]: '^0.0.17'}}))
        }, 'pnpm')
        expect(await step.apply(ctx)).toEqual({status: 'done'})
        expect(await step.detect(ctx)).toBe('present')
        expect(await step.verify(ctx)).toBe(true)
        const written: unknown = JSON.parse(readFileSync(join(ctx.cwd, 'package.json'), 'utf8'))
        expect(written).toEqual({name: 'app', devDependencies: {'@conciv/it': '^0.0.17'}})
      })

      it('a throwing add degrades to manual with the pnpm add command on the card', async () => {
        const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
        const step = installItStep(async () => {
          throw new Error('registry unreachable')
        }, 'pnpm')
        const outcome = await step.apply(ctx)
        expect(outcome).toEqual({
          status: 'manual',
          detail: 'registry unreachable',
          cards: [
            {
              title: 'Install @conciv/it',
              body: 'The automatic install failed. Run this in your project:',
              snippet: 'pnpm add --save-dev @conciv/it',
            },
          ],
        })
        expect(await step.verify(ctx)).toBe(false)
      })
    })
  })
})
