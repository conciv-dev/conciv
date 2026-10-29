import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {createRunStore, openDb} from '@conciv/db'
import {createTestHarness} from '@conciv/harness-testkit'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

describe('boot reclaim of runs left behind by a dead process (IT)', () => {
  const disposers: (() => Promise<void>)[] = []
  const roots: string[] = []

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) await dispose()
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  async function bootOver(root: string): Promise<void> {
    const harness = createTestHarness(requireClaude())
    const made = await bootMadeApp({stateRoot: root, cwd: root, harness})
    disposers.push(made.dispose)
  }

  function crashedRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-boot-reclaim-'))
    roots.push(root)
    return root
  }

  it('terminalizes a run row a dead process left running', async () => {
    const root = crashedRoot()
    await createRunStore(openDb(root)).createOrResume({runId: 'crashed', threadId: 'thread-crash', startedAt: 10})
    await bootOver(root)
    const record = await createRunStore(openDb(root)).get('crashed')
    expect(record?.status).toBe('aborted')
    expect(record?.finishedAt).toBeTypeOf('number')
  }, 30_000)

  it('leaves a run that already reached a terminal status untouched', async () => {
    const root = crashedRoot()
    const seeded = createRunStore(openDb(root))
    await seeded.createOrResume({runId: 'settled', threadId: 'thread-settled', startedAt: 10})
    await seeded.update('settled', {status: 'completed', finishedAt: 20})
    await bootOver(root)
    await expect(createRunStore(openDb(root)).get('settled')).resolves.toMatchObject({
      status: 'completed',
      finishedAt: 20,
    })
  }, 30_000)
})
