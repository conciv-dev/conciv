import {mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {startTurn} from '../helpers/detached-turn.js'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('claude workspace projection (IT)', () => {
  const state = {made: undefined as MadeApp | undefined, dirs: [] as string[]}

  afterEach(async () => {
    if (state.made) await state.made.dispose()
    state.made = undefined
    for (const dir of state.dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function tmp(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    state.dirs.push(dir)
    return dir
  }

  it('ships skills through --plugin-dir and projects nothing into the project directory', async () => {
    const cwd = tmp('conciv-projection-cwd-')
    const argvFile = join(tmp('conciv-projection-argv-'), 'argv.json')
    const made = await bootMadeApp(
      {stateRoot: tmp('conciv-projection-state-'), cwd, harness: claude},
      {fakeClaude: {env: () => ({CONCIV_TEST_ARGV_FILE: argvFile})}},
    )
    state.made = made
    const sessionId = SessionId.parse('conciv_projection-1')
    await startTurn(made.chat, sessionId, 'projection-1', 'hi')
    await vi.waitFor(async () => expect(await made.chat.runs.findActiveRun(sessionId)).toBeNull(), {
      timeout: 8000,
      interval: 50,
    })

    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--plugin-dir')

    const entries = readdirSync(cwd)
    expect(entries).not.toContain('.mcp.json')
    expect(entries).not.toContain('.claude')
    expect(entries.filter((entry) => entry.startsWith('.tanstack-projected-'))).toEqual([])
  }, 30_000)
})
