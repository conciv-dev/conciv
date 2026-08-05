import {describe, expect, it, vi} from 'vitest'
import {main} from '../src/bin.js'
import {runCli} from '../src/run.js'
import {answerNextQuery, bootCli} from './support/cli-app.js'
import {cliSession} from './support/cli-session.js'

const {cleanups} = cliSession()

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
    expect(answer.seen()).toMatchObject({kind: 'effect', action: 'enable', effect: 'confetti'})
  })

  it('accepts every action value the protocol declares, not only the first three', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'react', 'track', '--action', 'toggle'])).toBe(0)
    expect(answer.seen()).toMatchObject({kind: 'track', action: 'toggle'})
  })

  it('names the attribute of an edit separately from the React component name', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'setattr', '#a', '--attribute', 'data-state', '--value', 'open'])).toBe(
      0,
    )
    expect(answer.seen()).toMatchObject({kind: 'setattr', attribute: 'data-state', value: 'open'})
  })

  it('rejects an edit that names no attribute rather than sending a nameless one', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'setattr', '#a', '--value', 'open'])).toBe(1)
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
})
