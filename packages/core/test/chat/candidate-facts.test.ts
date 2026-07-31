import {appendFileSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {UIMessage} from '@conciv/protocol/chat-types'
import type {
  HarnessAdapter,
  HarnessHistory,
  HarnessLiveSession,
  HarnessSessionMeta,
  HarnessSessionSummary,
  TranscriptFailure,
  TranscriptHandle,
} from '@conciv/protocol/harness-types'
import {requireClaude} from '../helpers/adapters.js'
import {liveCandidates, type CandidateDeps} from '../../src/chat/adopt.js'

type Reads = {count: number}

type FixtureOptions = {summary: boolean; failure?: TranscriptFailure}

const state = {dir: ''}

function transcriptFile(sessionId: string): string {
  return join(state.dir, `${sessionId}.jsonl`)
}

function writeTranscript(sessionId: string, lines: string[]): void {
  writeFileSync(transcriptFile(sessionId), lines.map((line) => `${line}\n`).join(''))
}

async function readLines(sessionId: string, reads: Reads): Promise<string[]> {
  reads.count += 1
  const raw = await readFile(transcriptFile(sessionId), 'utf8')
  return raw.split('\n').filter(Boolean)
}

function messagesOf(lines: string[]): UIMessage[] {
  return lines.map((line, index) => ({
    id: `h${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [{type: 'text', content: line}],
  }))
}

function metaOf(sessionId: string, lines: string[], updatedAt: number): HarnessSessionMeta {
  return {id: sessionId, derivedTitle: lines[0] ?? '', updatedAt, messageCount: lines.length}
}

function failureFor(path: string, error: unknown): TranscriptFailure {
  const code = error instanceof Error && 'code' in error ? error.code : ''
  return {ok: false, reason: code === 'ENOENT' ? 'missing' : 'unreadable', detail: `${path}: ${String(error)}`}
}

function fixtureHandle(sessionId: string, options: FixtureOptions): TranscriptHandle {
  const failed = options.failure
  const path = transcriptFile(sessionId)
  return {
    async revision() {
      if (failed) return failed
      try {
        const info = await stat(path)
        return {rev: `${info.size}:${info.mtimeMs}`, changedAt: info.mtimeMs}
      } catch (error) {
        return failureFor(path, error)
      }
    },
    read() {
      return Promise.resolve(failed ?? failureFor(path, new Error('this fixture never streams content')))
    },
    close() {},
  }
}

function fixtureHistory(reads: Reads, options: FixtureOptions): HarnessHistory {
  const messages = async (_cwd: string, sessionId: string): Promise<UIMessage[]> =>
    messagesOf(await readLines(sessionId, reads))
  const meta = async (_cwd: string, sessionId: string): Promise<HarnessSessionMeta | null> => {
    const lines = await readLines(sessionId, reads)
    return metaOf(sessionId, lines, (await stat(transcriptFile(sessionId))).mtimeMs)
  }
  const summary = async (_cwd: string, sessionId: string): Promise<HarnessSessionSummary | null> => {
    const lines = await readLines(sessionId, reads)
    const info = await stat(transcriptFile(sessionId))
    return {meta: metaOf(sessionId, lines, info.mtimeMs), tail: messagesOf(lines)}
  }
  const base = {
    messages,
    meta,
    observe: (_cwd: string, id: string) => fixtureHandle(id, options),
    list: () => Promise.resolve([]),
  }
  return options.summary ? {...base, summary} : base
}

function candidate(sessionId: string): HarnessLiveSession {
  return {sessionId, pid: process.pid, cwd: state.dir, name: 'terminal', status: 'idle', startedAt: 1}
}

function fixtureDeps(sessionIds: () => string[], reads: Reads, options: FixtureOptions): CandidateDeps {
  const claude = requireClaude()
  if (!claude.commands) throw new Error('claude harness lacks commands')
  const harness: HarnessAdapter = {
    ...claude,
    capabilities: {...claude.capabilities, transcriptHistory: true, slashCommands: 'live'},
    commands: claude.commands,
    attach: {
      candidates: () => Promise.resolve(sessionIds().map(candidate)),
      install: () => Promise.resolve({ok: true, reloadCommand: ''}),
      uninstall: () => Promise.resolve(),
    },
    history: fixtureHistory(reads, options),
  }
  return {cwd: state.dir, harness, dialed: () => false}
}

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'conciv-candidate-facts-'))
})

afterEach(() => {
  rmSync(state.dir, {recursive: true, force: true})
})

describe('the facts the picker shows for a running session', () => {
  it('reads a transcript once and serves the next poll from the revision memo', async () => {
    const reads = {count: 0}
    writeTranscript('once', ['plan the migration', 'reading the manifests'])
    const deps = fixtureDeps(() => ['once'], reads, {summary: true})

    const first = await liveCandidates(deps)
    const second = await liveCandidates(deps)

    expect(first[0]).toMatchObject({title: 'plan the migration', messageCount: 2})
    expect(second[0]).toEqual(first[0])
    expect(reads.count).toBe(1)
  })

  it('reads again once the transcript has a new revision', async () => {
    const reads = {count: 0}
    writeTranscript('changed', ['first question'])
    const deps = fixtureDeps(() => ['changed'], reads, {summary: true})

    await liveCandidates(deps)
    appendFileSync(transcriptFile('changed'), 'a second turn\n')
    const after = await liveCandidates(deps)

    expect(after[0]).toMatchObject({messageCount: 2})
    expect(reads.count).toBe(2)
  })

  it('falls back to meta plus messages when the harness has no summary, still once per revision', async () => {
    const reads = {count: 0}
    writeTranscript('fallback', ['only question'])
    const deps = fixtureDeps(() => ['fallback'], reads, {summary: false})

    const first = await liveCandidates(deps)
    await liveCandidates(deps)

    expect(first[0]).toMatchObject({title: 'only question', messageCount: 1})
    expect(reads.count).toBe(2)
  })

  it('reports a session whose transcript does not exist yet as empty without reading anything', async () => {
    const reads = {count: 0}
    const deps = fixtureDeps(() => ['unwritten'], reads, {summary: true})

    const [found] = await liveCandidates(deps)

    expect(found).toMatchObject({title: '', messageCount: 0, tail: []})
    expect(reads.count).toBe(0)
  })

  it('refuses to pass an unreadable transcript off as an empty session', async () => {
    const reads = {count: 0}
    writeTranscript('locked', ['a real conversation'])
    const failure: TranscriptFailure = {ok: false, reason: 'unreadable', detail: 'EACCES: permission denied'}
    const deps = fixtureDeps(() => ['locked'], reads, {summary: true, failure})

    const [found] = await liveCandidates(deps)

    expect(found).toMatchObject({historyStatus: 'unavailable', title: '', messageCount: 0})
  })

  it('marks a transcript it could read as readable', async () => {
    const reads = {count: 0}
    writeTranscript('readable', ['a real conversation'])
    const deps = fixtureDeps(() => ['readable'], reads, {summary: true})

    const [found] = await liveCandidates(deps)

    expect(found).toMatchObject({historyStatus: 'ok', title: 'a real conversation'})
  })

  it('rejects instead of reporting no running sessions when the listing itself fails', async () => {
    const reads = {count: 0}
    const deps = fixtureDeps(() => ['never-listed'], reads, {summary: true})
    const attach = deps.harness.attach
    if (!attach) throw new Error('the fixture harness lost its attach sidecar')
    const failing = {
      ...deps.harness,
      attach: {...attach, candidates: () => Promise.reject(new Error('claude agents exited with code 1'))},
    }

    await expect(liveCandidates({...deps, harness: failing})).rejects.toThrow(/claude agents exited with code 1/)
  })

  it('remembers at most 64 sessions, so the 65th evicts exactly one', async () => {
    const reads = {count: 0}
    const ids = Array.from({length: 65}, (_, index) => `bounded-${index}`)
    for (const id of ids) writeTranscript(id, [`question ${id}`])
    const single = {id: ids[0] ?? ''}
    const deps = fixtureDeps(() => [single.id], reads, {summary: true})

    for (const id of ids) {
      single.id = id
      await liveCandidates(deps)
    }
    expect(reads.count).toBe(65)

    for (const id of ids.toReversed()) {
      single.id = id
      await liveCandidates(deps)
    }
    expect(reads.count).toBe(66)
  })
})
