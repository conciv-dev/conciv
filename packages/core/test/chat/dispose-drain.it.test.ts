import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {createTestkit, until, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()
const roots: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

function hasBridgeConfig(dir: string): boolean {
  return readdirSync(dir).some((entry) => entry.startsWith('.tanstack-mcp-bridge-'))
}

function turnEndProbe(turns: string[]) {
  return defineExtension({name: 'drain-probe'}).server(() => ({
    context: {},
    turnEnd: (sessionId: string) => {
      turns.push(sessionId)
    },
  }))
}

describe('app dispose (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    state.kit = undefined
    for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  })

  it('waits for an in-flight turn to reach its turn-end before dispose resolves', async () => {
    const releaseFile = join(tmp('conciv-dispose-release-'), 'release')
    const turns: string[] = []
    const kit = await createTestkit(
      claude,
      bootCoreApp({
        extensions: [turnEndProbe(turns)],
        fakeClaude: {env: () => ({CONCIV_FAKE_RELEASE_FILE: releaseFile})},
      }),
    ).setup()
    state.kit = kit
    const sessionId = await kit.session()
    await kit.rpc.chat.send({sessionId, text: 'hi'})
    await until(() => hasBridgeConfig(kit.stateRoot), {hangGuardMs: 10_000})
    expect(turns).toEqual([])

    const release = setTimeout(() => writeFileSync(releaseFile, ''), 150)
    await kit.cleanup()
    clearTimeout(release)

    expect(turns).toEqual([sessionId])
  }, 30_000)

  it('closes the sqlite handle when the app disposes', async () => {
    const stateRoot = tmp('conciv-dispose-db-')
    const booted = await bootCoreApp()({stateRoot, cwd: stateRoot, harness: claude})
    const walFile = join(stateRoot, '.conciv', 'conciv.db-wal')
    expect(existsSync(walFile)).toBe(true)

    await booted.dispose()

    expect(existsSync(walFile)).toBe(false)
  }, 30_000)
})
