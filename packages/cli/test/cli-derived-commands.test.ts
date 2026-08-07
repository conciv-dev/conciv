import {describe, expect, it, vi} from 'vitest'
import {z} from 'zod'
import {main} from '../src/bin.js'
import {runCli} from '../src/run.js'
import {answerNextQuery, bootCli} from './support/cli-app.js'
import {cliSession} from './support/cli-session.js'
import {onlyDocument} from './support/stdout.js'

const {cleanups, written} = cliSession()

const FailureSchema = z.object({ok: z.literal(false), error: z.object({kind: z.enum(['user', 'unexpected'])})})

async function helpFor(argv: string[]): Promise<string> {
  const logged: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logged.push(String(line))
  })
  expect(await runCli(main, argv)).toBe(0)
  return logged.join('\n')
}

describe('the CLI reads its commands from the tool declarations', () => {
  it('sends the effect argument to the server instead of dropping it', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'effect', '--action', 'enable', '--effect', 'confetti'])).toBe(0)
    expect(answer.seen()).toMatchObject({name: 'page.effect', input: {action: 'enable', effect: 'confetti'}})
  })

  it('accepts every action value the protocol declares, not only the first three', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'react', 'track', '--action', 'toggle'])).toBe(0)
    expect(answer.seen()).toMatchObject({name: 'page.track', input: {action: 'toggle'}})
  })

  it('names the attribute of an edit separately from the React component name', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
    expect(await runCli(main, ['tools', 'page', 'setattr', '#a', '--attribute', 'data-state', '--value', 'open'])).toBe(
      0,
    )
    expect(answer.seen()).toMatchObject({
      name: 'page.setattr',
      input: {selector: '#a', attribute: 'data-state', value: 'open'},
    })
  })

  it('rejects an edit that names no attribute rather than sending a nameless one', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'setattr', '#a', '--value', 'open'])).toBe(1)
    expect(answer.seen()).toBeNull()
  })

  it('clears a field when the value is explicitly empty', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, value: ''}})
    expect(await runCli(main, ['tools', 'page', 'fill', '#email', '--value', ''])).toBe(0)
    expect(answer.seen()).toMatchObject({name: 'page.fill', input: {selector: '#email', value: ''}})
  })

  it('still refuses a required flag that was never passed at all', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
    expect(await runCli(main, ['tools', 'page', 'fill', '#email'])).toBe(1)
    expect(answer.seen()).toBeNull()
  })

  it("describes a verb by what it does, never by the verb's own command path", async () => {
    await bootCli(cleanups)
    const help = await helpFor(['tools', 'page', '--help'])
    expect(help).not.toMatch(/page fill/)
    expect(help).toContain('type a value into a form field')
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
    await bootCli(cleanups, {
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
    expect(await runCli(main, ['tools', 'server', 'reload', 'src/hot.ts'])).toBe(0)
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
    expect(await runCli(main, ['tools', 'server', 'resolve', './x.ts', '--importer', 'src/a.ts'])).toBe(0)
    expect(resolved).toEqual(['./x.ts from src/a.ts'])
  })

  it('rejects a non-positive line number as a plain user mistake, not a bug', async () => {
    await bootCli(cleanups)
    expect(await runCli(main, ['tools', 'open', 'src/a.ts', '--line', '0'])).toBe(1)
    expect(FailureSchema.parse(onlyDocument(written)).error.kind).toBe('user')
  })

  it('rejects a fractional line number as a plain user mistake, not a bug', async () => {
    await bootCli(cleanups)
    expect(await runCli(main, ['tools', 'open', 'src/a.ts', '--line', '1.5'])).toBe(1)
    expect(FailureSchema.parse(onlyDocument(written)).error.kind).toBe('user')
  })

  it('opens at a positive integer line number', async () => {
    const opened: {file: string; line?: number}[] = []
    await bootCli(cleanups, {openInEditor: (file, line) => opened.push({file, line})})
    expect(await runCli(main, ['tools', 'open', 'src/a.ts', '--line', '3'])).toBe(0)
    expect(opened).toEqual([{file: 'src/a.ts', line: 3}])
  })
})
