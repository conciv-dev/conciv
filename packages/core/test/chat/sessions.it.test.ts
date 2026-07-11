import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {runTurn} from '../helpers/turns.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()
const homes: string[] = []

const encodeProjectDir = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

function projectDir(home: string, cwd: string): string {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, {recursive: true})
  return dir
}
function seedTranscript(dir: string, id: string, firstUserText: string): void {
  writeFileSync(join(dir, `${id}.jsonl`), JSON.stringify({type: 'user', message: {content: firstUserText}}) + '\n')
}
function tmpHome(): string {
  const h = mkdtempSync(join(tmpdir(), 'conciv-home-'))
  homes.push(h)
  return h
}

describe('sessions.list + rename over rpc (IT, real temp ~/.claude)', () => {
  const state = {kit: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const h of homes.splice(0)) rmSync(h, {recursive: true, force: true})
  })

  async function setup(home: string, cwd?: string): Promise<Kit> {
    const kit = await createTestkit(claude, bootCoreApp({cwd, claudeHome: home, fakeClaude: {}})).setup()
    state.kit = kit
    return kit
  }

  it('lists our records (origin conciv) joined to transcripts, plus unwrapped externals', async () => {
    const home = tmpHome()
    const cwd = process.cwd()
    const dir = projectDir(home, cwd)

    seedTranscript(dir, 'sess-fake', 'made in conciv')
    seedTranscript(dir, 'tok-ext', 'made in terminal')
    const kit = await setup(home, cwd)

    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    const sessions = await kit.rpc.sessions.list(undefined)
    expect(sessions.find((s) => s.id === id)?.origin).toBe('conciv')
    expect(sessions.find((s) => s.id === id)?.title).toBe('made in conciv')
    expect(sessions.find((s) => s.id === 'tok-ext')?.origin).toBe('external')
  })

  it('rename persists into the next list (keyed by our id)', async () => {
    const home = tmpHome()
    const cwd = process.cwd()
    seedTranscript(projectDir(home, cwd), 'tok-ext', 'made in terminal')
    const kit = await setup(home, cwd)

    const id = await kit.session('tok-ext')
    await kit.rpc.sessions.rename({sessionId: id, title: 'My title'})
    const sessions = await kit.rpc.sessions.list(undefined)
    expect(sessions.find((s) => s.id === id)?.title).toBe('My title')
  })

  it('rejects a rename for an unknown session id', async () => {
    const kit = await setup(tmpHome())
    await expect(kit.rpc.sessions.rename({sessionId: '../etc', title: 'x'})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
