import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import {mkdtemp, mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {beforeAll, describe, expect, it} from 'vitest'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {
  TranscriptChunk,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import {
  claudeHistory,
  encodeProjectDir,
  parseHistory as claudeParse,
  parseSessionMeta,
  transcriptPath,
} from '../src/claude/history.js'
import {codexHistory, sessionsRoot, stateDbPath} from '../src/codex/history.js'
import {piHistory, sessionsDir} from '../src/pi/history.js'
import {opencodeHistory, storagePath} from '../src/opencode/history.js'

const FIXTURES = new URL('./fixtures/', import.meta.url)

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8')
}

function golden(name: string): {messages: unknown[]; meta?: unknown; name?: unknown; contextTokens?: unknown} {
  return JSON.parse(fixture(name))
}

function chunk(result: TranscriptChunk | TranscriptFailure): TranscriptChunk {
  if (!result.ok) throw new Error(`expected a chunk, got ${result.reason}: ${result.detail}`)
  return result
}

function revision(result: TranscriptRevision | TranscriptFailure): TranscriptRevision {
  if ('ok' in result) throw new Error(`expected a revision, got ${result.reason}: ${result.detail}`)
  return result
}

function failure(result: TranscriptRevision | TranscriptChunk | TranscriptFailure): TranscriptFailure {
  if (!('ok' in result) || result.ok !== false) throw new Error(`expected a failure, got ${JSON.stringify(result)}`)
  return result
}

function overwriteAt(path: string, offset: number, text: string): void {
  const fd = openSync(path, 'r+')
  writeSync(fd, Buffer.from(text, 'utf8'), 0, Buffer.byteLength(text), offset)
  closeSync(fd)
}

function userLine(text: string): string {
  return JSON.stringify({type: 'user', message: {role: 'user', content: text}})
}

async function foldLineByLine(handle: TranscriptHandle, path: string, lines: string[]): Promise<unknown[]> {
  let messages: unknown[] = []
  for (const line of lines) {
    appendFileSync(path, `${line}\n`)
    messages = chunk(await handle.read()).messages
  }
  return messages
}

const CLAUDE_CWD = '/workspace/claude.demo'

describe('claude transcript handle', () => {
  const state = {home: ''}

  beforeAll(async () => {
    state.home = await mkdtemp(join(tmpdir(), 'claude-handle-'))
    await mkdir(join(state.home, '.claude', 'projects', encodeProjectDir(CLAUDE_CWD)), {recursive: true})
  })

  const seed = (id: string, body: string): string => {
    const path = transcriptPath(CLAUDE_CWD, id, state.home)
    writeFileSync(path, body)
    return path
  }

  const observe = (id: string): TranscriptHandle =>
    claudeHistory.observe(CLAUDE_CWD, HarnessSessionId.parse(id), state.home)

  it('reads only the bytes appended since the previous read', async () => {
    const first = userLine('aaa')
    const rewritten = userLine('zzz')
    const path = seed('incremental', `${first}\n`)
    const handle = observe('incremental')

    const one = chunk(await handle.read())
    expect(one.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]}])
    expect(one.replaced).toBe(true)

    expect(Buffer.byteLength(rewritten)).toBe(Buffer.byteLength(first))
    overwriteAt(path, 0, rewritten)
    appendFileSync(path, `${userLine('bbb')}\n`)

    const two = chunk(await handle.read())
    expect(two.replaced).toBe(false)
    expect(two.messages).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]},
      {id: 'h2', role: 'user', parts: [{type: 'text', content: 'bbb'}]},
    ])
    expect(two.rev).not.toBe(one.rev)

    expect(claudeParse(readFileSync(path, 'utf8')).map((message) => message.parts)).toEqual([
      [{type: 'text', content: 'zzz'}],
      [{type: 'text', content: 'bbb'}],
    ])
    handle.close()
  })

  it('never parses a torn trailing line and folds it once it completes', async () => {
    const complete = userLine('bbb')
    const path = seed('torn', `${userLine('aaa')}\n`)
    const handle = observe('torn')

    expect(chunk(await handle.read()).messages).toHaveLength(1)

    appendFileSync(path, complete.slice(0, 20))
    const partial = chunk(await handle.read())
    expect(partial.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]}])
    expect(partial.replaced).toBe(false)

    appendFileSync(path, `${complete.slice(20)}\n`)
    expect(chunk(await handle.read()).messages).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]},
      {id: 'h2', role: 'user', parts: [{type: 'text', content: 'bbb'}]},
    ])
    handle.close()
  })

  it('rebuilds from scratch when the file shrinks', async () => {
    const path = seed('truncated', [userLine('one'), userLine('two'), userLine('three'), ''].join('\n'))
    const handle = observe('truncated')
    expect(chunk(await handle.read()).messages).toHaveLength(3)

    writeFileSync(path, `${userLine('one')}\n`)
    const after = chunk(await handle.read())
    expect(after.replaced).toBe(true)
    expect(after.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'one'}]}])
    handle.close()
  })

  it('reports a missing transcript as a typed failure, never as an empty transcript', async () => {
    const handle = observe('absent')
    expect(failure(await handle.revision()).reason).toBe('missing')
    expect(failure(await handle.read()).reason).toBe('missing')
    handle.close()
  })

  it('reports an unreadable transcript as a typed failure', async () => {
    mkdirSync(transcriptPath(CLAUDE_CWD, 'directory', state.home), {recursive: true})
    const handle = observe('directory')
    expect(failure(await handle.read()).reason).toBe('unreadable')
    handle.close()
  })

  it('releases its parser state on close and refuses later reads', async () => {
    seed('closed', `${userLine('aaa')}\n`)
    const handle = observe('closed')
    expect(chunk(await handle.read()).messages).toHaveLength(1)
    handle.close()
    expect(failure(await handle.revision()).reason).toBe('unreadable')
    expect(failure(await handle.read()).reason).toBe('unreadable')
  })

  it('stats without reading any message content', async () => {
    const path = seed('stat-only', `${userLine('aaa')}\n`)
    const handle = observe('stat-only')
    const one = revision(await handle.revision())
    expect(one.rev).toContain(':')
    expect(one.changedAt).toBeGreaterThan(0)
    appendFileSync(path, `${userLine('bbb')}\n`)
    expect(revision(await handle.revision()).rev).not.toBe(one.rev)
    handle.close()
  })

  it('leaves sub-agent (sidechain) records out of the main thread', () => {
    const jsonl = [
      userLine('main prompt'),
      JSON.stringify({
        type: 'assistant',
        isSidechain: true,
        message: {id: 'msg_side', role: 'assistant', content: [{type: 'text', text: 'subagent chatter'}]},
      }),
      JSON.stringify({type: 'user', isSidechain: true, message: {role: 'user', content: 'subagent prompt'}}),
      JSON.stringify({
        type: 'assistant',
        message: {id: 'msg_m', role: 'assistant', content: [{type: 'text', text: 'main answer'}]},
      }),
      '',
    ].join('\n')
    expect(claudeParse(jsonl)).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'main prompt'}]},
      {id: 'h2', role: 'assistant', parts: [{type: 'text', content: 'main answer'}]},
    ])
    expect(parseSessionMeta('side', jsonl, 5).messageCount).toBe(2)
  })

  it('folds line by line to exactly what the whole-file parser produces', async () => {
    const expected = golden('claude-golden.json')
    const raw = fixture('claude-transcript.jsonl')
    expect(claudeParse(raw)).toEqual(expected.messages)
    expect(parseSessionMeta('fixture', raw, 1785417797467)).toEqual(expected.meta)
    expect(claudeHistory.nameFromTranscript?.(raw)).toEqual(expected.name)
    expect(claudeHistory.contextTokens?.(raw)).toEqual(expected.contextTokens)

    const path = seed('equivalence', '')
    const handle = observe('equivalence')
    expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
    handle.close()
  })

  it('summarises a transcript with one read: meta plus a message tail', async () => {
    const raw = fixture('claude-transcript.jsonl')
    seed('summary', raw)
    const summary = await claudeHistory.summary?.(CLAUDE_CWD, HarnessSessionId.parse('summary'), state.home)
    if (!summary) throw new Error('expected a summary')
    const expected = golden('claude-golden.json')
    expect(summary.meta).toMatchObject({
      id: 'summary',
      derivedTitle: 'rename the settings panel',
      messageCount: claudeParse(raw).length,
      model: 'claude-opus-4-8',
    })
    expect(summary.tail).toEqual(expected.messages.slice(-12))
    expect(await claudeHistory.summary?.(CLAUDE_CWD, HarnessSessionId.parse('absent'), state.home)).toBeNull()
  })
})

const CODEX_CWD = '/workspace/demo'
const CODEX_SESSION = 'fixture'

describe('codex transcript handle', () => {
  const state = {home: '', outside: ''}

  const seedThread = (id: string, path: string): void => {
    const db = new DatabaseSync(stateDbPath(state.home))
    db.exec(
      `create table if not exists threads (id text primary key, rollout_path text not null, cwd text not null, title text not null default '', first_user_message text not null default '', preview text not null default '', model text, tokens_used integer not null default 0, archived integer not null default 0, created_at integer not null, updated_at integer not null, created_at_ms integer, updated_at_ms integer)`,
    )
    db.prepare('insert or replace into threads (id, rollout_path, cwd, created_at, updated_at) values (?,?,?,?,?)').run(
      id,
      path,
      CODEX_CWD,
      1,
      2,
    )
    db.close()
  }

  beforeAll(async () => {
    state.home = await mkdtemp(join(tmpdir(), 'codex-handle-'))
    state.outside = await mkdtemp(join(tmpdir(), 'codex-rollouts-'))
    await mkdir(join(state.home, '.codex'), {recursive: true})
    await mkdir(sessionsRoot(state.home), {recursive: true})
  })

  const observe = (id: string): TranscriptHandle =>
    codexHistory.observe(CODEX_CWD, HarnessSessionId.parse(id), state.home)

  it('folds line by line to exactly what the whole-file parser produces', async () => {
    const expected = golden('codex-golden.json')
    const raw = fixture('codex-rollout.jsonl')
    const whole = join(state.outside, 'whole-file.jsonl')
    writeFileSync(whole, raw)
    seedThread('whole-file', whole)
    expect(await codexHistory.messages(CODEX_CWD, HarnessSessionId.parse('whole-file'), state.home)).toEqual(
      expected.messages,
    )

    const path = join(state.outside, 'equivalence.jsonl')
    writeFileSync(path, '')
    seedThread('equivalence', path)
    const handle = observe('equivalence')
    expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
    handle.close()
  })

  it('resolves the rollout path once instead of once per poll', async () => {
    const path = join(state.outside, 'resolved-once.jsonl')
    writeFileSync(path, fixture('codex-rollout.jsonl'))
    seedThread(CODEX_SESSION, path)
    const handle = observe(CODEX_SESSION)
    expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)

    rmSync(stateDbPath(state.home))
    expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)
    expect(chunk(await handle.read()).messages).toEqual(golden('codex-golden.json').messages)
    handle.close()
    seedThread(CODEX_SESSION, path)
  })

  it('checks the cwd from the head of the rollout, not the whole file', async () => {
    const filler = `${JSON.stringify({type: 'event_msg', payload: {type: 'agent_message', message: 'x'.repeat(500)}})}\n`
    const meta = `${JSON.stringify({type: 'session_meta', payload: {session_id: 'late', cwd: CODEX_CWD}})}\n`
    const path = join(state.outside, 'late-meta.jsonl')
    writeFileSync(path, filler.repeat(2200) + meta)
    expect(readFileSync(path).byteLength).toBeGreaterThan(1_000_000)
    seedThread('late-meta', path)
    const handle = observe('late-meta')
    expect(failure(await handle.read()).reason).toBe('corrupt')
    handle.close()
  })

  it('refuses a rollout recorded in another cwd', async () => {
    const path = join(state.outside, 'foreign.jsonl')
    writeFileSync(
      path,
      `${JSON.stringify({type: 'session_meta', payload: {session_id: 'foreign', cwd: '/elsewhere'}})}\n`,
    )
    seedThread('foreign', path)
    const handle = observe('foreign')
    expect(failure(await handle.read()).reason).toBe('missing')
    handle.close()
  })

  it('reports an unknown session as missing', async () => {
    const handle = observe('never-recorded')
    expect(failure(await handle.revision()).reason).toBe('missing')
    handle.close()
  })
})

const PI_CWD = '/workspace/pi.handle'

describe('pi transcript handle', () => {
  const state = {home: ''}

  beforeAll(async () => {
    state.home = await mkdtemp(join(tmpdir(), 'pi-handle-'))
    await mkdir(sessionsDir(PI_CWD, state.home), {recursive: true})
  })

  const pathFor = (name: string): string => join(sessionsDir(PI_CWD, state.home), name)
  const observe = (id: string): TranscriptHandle => piHistory.observe(PI_CWD, HarnessSessionId.parse(id), state.home)

  it('folds line by line to exactly what the whole-file parser produces', async () => {
    const expected = golden('pi-golden.json')
    const raw = fixture('pi-session.jsonl')
    writeFileSync(pathFor('2026-07-30T08-00-00-000Z_whole-file.jsonl'), raw)
    expect(await piHistory.messages(PI_CWD, HarnessSessionId.parse('whole-file'), state.home)).toEqual(
      expected.messages,
    )

    const path = pathFor('2026-07-30T09-45-14-653Z_equivalence.jsonl')
    writeFileSync(path, '')
    const handle = observe('equivalence')
    expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
    handle.close()
  })

  it('scans the session directory once and keeps the resolved file', async () => {
    const path = pathFor('2026-07-30T10-00-00-000Z_scanned.jsonl')
    writeFileSync(path, fixture('pi-session.jsonl'))
    const handle = observe('scanned')
    expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)

    renameSync(path, pathFor('2026-07-30T11-00-00-000Z_scanned.jsonl'))
    expect(failure(await handle.revision()).reason).toBe('missing')
    handle.close()
  })

  it('keeps looking for a transcript that does not exist yet', async () => {
    const handle = observe('later')
    expect(failure(await handle.revision()).reason).toBe('missing')
    writeFileSync(pathFor('2026-07-30T12-00-00-000Z_later.jsonl'), fixture('pi-session.jsonl'))
    expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)
    expect(chunk(await handle.read()).messages).toEqual(golden('pi-golden.json').messages)
    handle.close()
  })
})

const OPENCODE_CWD = '/workspace/demo'
const OPENCODE_SESSION = 'ses_handle'
const OPENCODE_STRAY = 'ses_stray'

describe('opencode transcript handle', () => {
  const state = {home: ''}

  beforeAll(async () => {
    state.home = await mkdtemp(join(tmpdir(), 'opencode-handle-'))
    await mkdir(join(state.home, '.local', 'share', 'opencode'), {recursive: true})
    const db = new DatabaseSync(storagePath(state.home))
    db.exec(
      `create table session (id text primary key, directory text not null, title text not null, time_created integer not null, time_updated integer not null, time_archived integer, model text, tokens_input integer not null default 0, tokens_output integer not null default 0)`,
    )
    db.exec(
      `create table message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
    )
    db.exec(
      `create table part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
    )
    const session = db.prepare(
      'insert into session (id, directory, title, time_created, time_updated, time_archived) values (?,?,?,?,?,?)',
    )
    session.run(OPENCODE_SESSION, OPENCODE_CWD, 'Count the files', 1, 1785305469728, null)
    session.run(OPENCODE_STRAY, '/workspace/other', 'Elsewhere', 1, 2, null)
    db.prepare('insert into message (id, session_id, time_created, time_updated, data) values (?,?,?,?,?)').run(
      'msg_1',
      OPENCODE_SESSION,
      1,
      1785305469728,
      JSON.stringify({role: 'user'}),
    )
    db.prepare(
      'insert into part (id, message_id, session_id, time_created, time_updated, data) values (?,?,?,?,?,?)',
    ).run('prt_1', 'msg_1', OPENCODE_SESSION, 1, 1, JSON.stringify({type: 'text', text: 'count the files'}))
    db.close()
  })

  const observe = (id: string, home = state.home): TranscriptHandle =>
    opencodeHistory.observe(OPENCODE_CWD, HarnessSessionId.parse(id), home)

  it('reports the newest write and the part count as its revision', async () => {
    const handle = observe(OPENCODE_SESSION)
    expect(revision(await handle.revision())).toEqual({rev: '1785305469728:1', changedAt: 1785305469728})
    const read = chunk(await handle.read())
    expect(read.replaced).toBe(true)
    expect(read.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'count the files'}]}])
    handle.close()
  })

  it('refuses a session recorded in another directory', async () => {
    const handle = observe(OPENCODE_STRAY)
    expect(failure(await handle.revision()).reason).toBe('missing')
    handle.close()
  })

  it('reports a missing database as a typed failure', async () => {
    const handle = observe(OPENCODE_SESSION, join(state.home, 'nowhere'))
    expect(failure(await handle.revision()).reason).toBe('missing')
    handle.close()
  })

  it('keeps one database connection open across polls', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'opencode-reuse-'))
    mkdirSync(join(copy, '.local', 'share', 'opencode'), {recursive: true})
    writeFileSync(storagePath(copy), readFileSync(storagePath(state.home)))
    const handle = observe(OPENCODE_SESSION, copy)
    expect(revision(await handle.revision()).changedAt).toBe(1785305469728)

    rmSync(storagePath(copy))
    expect(revision(await handle.revision()).changedAt).toBe(1785305469728)
    expect(chunk(await handle.read()).messages).toHaveLength(1)
    handle.close()
    rmSync(copy, {recursive: true, force: true})
  })

  it('closes the database connection it holds', async () => {
    const openFileCount = (): number => readdirSync('/dev/fd').length
    const warm = observe(OPENCODE_SESSION)
    await warm.read()
    warm.close()

    const before = openFileCount()
    const first = observe(OPENCODE_SESSION)
    const handles = [first, observe(OPENCODE_SESSION), observe(OPENCODE_SESSION)]
    for (const handle of handles) await handle.read()
    expect(openFileCount()).toBeGreaterThanOrEqual(before + handles.length)

    for (const handle of handles) handle.close()
    expect(openFileCount()).toBe(before)
    expect(failure(await first.read()).reason).toBe('unreadable')
  })
})
