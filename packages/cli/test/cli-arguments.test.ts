import {describe, expect, it, vi} from 'vitest'
import {main} from '../src/bin.js'
import {runCli} from '../src/run.js'
import {answerNextQuery, bootCli} from './support/cli-app.js'
import {onlyDocument} from './support/stdout.js'
import {cliSession} from './support/cli-session.js'

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
    const code = await runCli(main, ['tools', 'page', 'click', '--refs', 'e12'])
    expect(code).toBe(1)
    expect(answer.seen()).toBeNull()
    const text = failureText()
    expect(text).toContain('--refs')
    expect(text).toContain('--ref')
  })

  it('rejects a mistyped kebab spelling of a real flag and keeps accepting the real one', async () => {
    const kit = await bootCli(cleanups)
    expect(await runCli(main, ['tools', 'react', 'override', '#a', '--hook-idx', '2'])).toBe(1)
    expect(failureText()).toContain('--hookId')
    written.length = 0
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true, target: 'hooks', path: ''}})
    expect(
      await runCli(main, ['tools', 'react', 'override', '#a', '--target', 'hooks', '--hook-id', '2', '--json', 'true']),
    ).toBe(0)
    expect(answer.seen()).toMatchObject({
      name: 'page.override',
      input: {selector: '#a', target: 'hooks', hookId: 2, json: 'true'},
    })
  })

  it('rejects an unknown flag placed before a nested subcommand instead of dropping it', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', '--bogus', 'page', 'click', '#a'])).toBe(1)
    expect(answer.seen()).toBeNull()
    expect(failureText()).toContain('--bogus')
  })

  it('rejects an unknown flag placed before the very first subcommand', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['--bogus', 'tools', 'page', 'click', '#a'])).toBe(1)
    expect(answer.seen()).toBeNull()
    expect(failureText()).toContain('--bogus')
  })

  it('still accepts an envelope flag placed before a nested subcommand', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {ok: true}})
    expect(await runCli(main, ['tools', '--json', 'page', 'click', '#a'])).toBe(0)
    expect(answer.seen()).toMatchObject({name: 'page.click'})
  })

  it('rejects an unknown subcommand with the closest verb', async () => {
    await bootCli(cleanups)
    expect(await runCli(main, ['tools', 'page', 'clik', '#a'])).toBe(1)
    const text = failureText()
    expect(text).toContain('clik')
    expect(text).toContain('click')
  })

  it('rejects a subcommand-less parent instead of printing a bare stack', async () => {
    await bootCli(cleanups)
    expect(await runCli(main, ['tools', 'page'])).toBe(1)
    expect(failureText()).toContain('--help')
  })

  it('rejects a positional passed as a flag and says how to pass it', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'click', '--selector', '#a'])).toBe(1)
    expect(answer.seen()).toBeNull()
    expect(failureText()).toContain('selector')
  })

  it('rejects an extra positional instead of dropping it', async () => {
    const kit = await bootCli(cleanups)
    const answer = await answerNextQuery(kit, {ok: true, result: {}})
    expect(await runCli(main, ['tools', 'page', 'click', '#a', '#b'])).toBe(1)
    expect(answer.seen()).toBeNull()
    expect(failureText()).toContain('#b')
  })

  it('prints usage for --help and exits 0 without touching the rpc', async () => {
    await bootCli(cleanups)
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logged.push(String(line))
    })
    expect(await runCli(main, ['tools', 'page', 'click', '--help'])).toBe(0)
    expect(written).toEqual([])
    expect(logged.join('\n')).toContain('--ref')
  })
})
