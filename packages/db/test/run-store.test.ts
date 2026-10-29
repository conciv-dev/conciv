import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {createRunStore} from '../src/run-store.js'
import {runs} from '../src/run-schema.js'

const stateRoot = () => mkdtempSync(join(tmpdir(), 'conciv-run-store-boot-'))

describe('the legacy run backfill', () => {
  it('imports a terminal legacy run row into the chat_runs store', async () => {
    const root = stateRoot()
    const first = openDb(root)
    first
      .insert(runs)
      .values({
        runId: 'legacy-done',
        sessionId: 'thread-legacy',
        phase: 'completed',
        startedAt: 100,
        finishedAt: 200,
        error: null,
        updatedAt: 200,
      })
      .run()
    const store = createRunStore(openDb(root))
    await expect(store.get('legacy-done')).resolves.toMatchObject({
      runId: 'legacy-done',
      threadId: 'thread-legacy',
      status: 'completed',
      startedAt: 100,
      finishedAt: 200,
    })
  })

  it('imports a stopping legacy run as a running record carrying the cancel request', async () => {
    const root = stateRoot()
    openDb(root)
      .insert(runs)
      .values({
        runId: 'legacy-stopping',
        sessionId: 'thread-legacy',
        phase: 'stopping',
        startedAt: 100,
        finishedAt: null,
        error: null,
        updatedAt: 100,
      })
      .run()
    const record = await createRunStore(openDb(root)).get('legacy-stopping')
    expect(record).toMatchObject({status: 'running', cancelRequested: true})
    expect(record?.finishedAt).toBeUndefined()
  })

  it('keeps the legacy error prose on an imported failed run', async () => {
    const root = stateRoot()
    openDb(root)
      .insert(runs)
      .values({
        runId: 'legacy-failed',
        sessionId: 'thread-legacy',
        phase: 'failed',
        startedAt: 1,
        finishedAt: 2,
        error: 'claude produced no output within 5s',
        updatedAt: 2,
      })
      .run()
    const record = await createRunStore(openDb(root)).get('legacy-failed')
    expect(record?.error).toEqual({message: 'claude produced no output within 5s'})
  })

  it('never re-imports over a record the store has since written', async () => {
    const root = stateRoot()
    openDb(root)
      .insert(runs)
      .values({
        runId: 'legacy-reimport',
        sessionId: 'thread-legacy',
        phase: 'running',
        startedAt: 1,
        finishedAt: null,
        error: null,
        updatedAt: 1,
      })
      .run()
    const store = createRunStore(openDb(root))
    await store.update('legacy-reimport', {status: 'completed', finishedAt: 42})
    const reopened = createRunStore(openDb(root))
    await expect(reopened.get('legacy-reimport')).resolves.toMatchObject({status: 'completed', finishedAt: 42})
  })
})

describe('the boot detach stamp', () => {
  it('hands a run left running by a dead process to listReclaimable on the next open', async () => {
    const root = stateRoot()
    await createRunStore(openDb(root)).createOrResume({runId: 'stuck', threadId: 'thread-stuck', startedAt: 10})
    const reopened = createRunStore(openDb(root))
    const reclaimable = await reopened.listReclaimable?.({now: Date.now(), ttlMs: 0})
    expect(reclaimable?.map((record) => record.runId)).toEqual(['stuck'])
  })

  it('leaves a terminal run out of the reclaimable set', async () => {
    const root = stateRoot()
    const store = createRunStore(openDb(root))
    await store.createOrResume({runId: 'finished', threadId: 'thread-finished', startedAt: 10})
    await store.update('finished', {status: 'completed', finishedAt: 20})
    const reopened = createRunStore(openDb(root))
    await expect(reopened.listReclaimable?.({now: Date.now(), ttlMs: 0})).resolves.toEqual([])
  })
})
