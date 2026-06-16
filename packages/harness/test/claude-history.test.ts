import {describe, it, expect} from 'vitest'
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseHistory, parseSessionMeta, claudeHistory, encodeProjectDir, listSessions, withinProject} from '../src/claude/history.js'

function seed(home: string, cwd: string, id: string, body: string, mtimeSec: number) {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, {recursive: true})
  const p = join(dir, `${id}.jsonl`)
  writeFileSync(p, body)
  utimesSync(p, mtimeSec, mtimeSec)
}

// claude records a user turn (from `-p "text"`) with message.content as a plain STRING, while
// assistant turns use a content-block array. History must keep both — on refresh the widget
// hydrates from this, and dropping string-content user messages makes only the AI's side show.
describe('parseHistory', () => {
  it('keeps user messages whose content is a plain string', () => {
    const jsonl = [
      JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
      JSON.stringify({
        type: 'assistant',
        message: {role: 'assistant', content: [{type: 'text', text: 'Lots of things.'}]},
      }),
    ].join('\n')

    const msgs = parseHistory(jsonl)
    const roles = msgs.map((m) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')

    const user = msgs.find((m) => m.role === 'user')
    expect(user?.parts).toContainEqual({type: 'text', content: 'what else can you do?'})
  })
})

describe('claudeHistory.nameFromTranscript', () => {
  it('returns the last summary record', () => {
    const jsonl = [
      JSON.stringify({type: 'summary', summary: 'First guess'}),
      JSON.stringify({type: 'user', message: {content: 'hi'}}),
      JSON.stringify({type: 'summary', summary: 'Fix the checkout layout bug'}),
    ].join('\n')
    expect(claudeHistory.nameFromTranscript?.(jsonl)).toBe('Fix the checkout layout bug')
  })

  it('returns null when there is no summary', () => {
    const jsonl = JSON.stringify({type: 'user', message: {content: 'hi'}})
    expect(claudeHistory.nameFromTranscript?.(jsonl)).toBeNull()
  })
})

describe('listSessions', () => {
  it('lists newest-first with title + count', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aidx-home-'))
    const cwd = '/proj/x'
    seed(home, cwd, 'old', JSON.stringify({type: 'user', message: {content: 'first task'}}) + '\n', 1000)
    seed(
      home,
      cwd,
      'new',
      [
        JSON.stringify({type: 'user', message: {content: 'newer task'}}),
        JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'ok'}]}}),
      ].join('\n') + '\n',
      2000,
    )
    const out = await listSessions(cwd, home)
    expect(out.map((s) => s.id)).toEqual(['new', 'old'])
    expect(out[0]).toMatchObject({derivedTitle: 'newer task', messageCount: 2})
    rmSync(home, {recursive: true, force: true})
  })

  it('caps at 50 and does not read the 51st', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aidx-home-'))
    const cwd = '/proj/y'
    for (let i = 0; i < 51; i++)
      seed(home, cwd, `s${String(i).padStart(2, '0')}`, JSON.stringify({type: 'user', message: {content: `t${i}`}}) + '\n', 1000 + i)
    const out = await listSessions(cwd, home)
    expect(out.length).toBe(50)
    expect(out.some((s) => s.id === 's00')).toBe(false) // oldest dropped
    rmSync(home, {recursive: true, force: true})
  })

  it('returns [] for a missing dir', async () => {
    expect(await listSessions('/no/such', mkdtempSync(join(tmpdir(), 'aidx-home-')))).toEqual([])
  })
})

describe('withinProject', () => {
  it('rejects traversal and accepts a normal id', () => {
    const home = mkdtempSync(join(tmpdir(), 'aidx-home-'))
    expect(withinProject('/proj', '../../etc/passwd', home)).toBe(false)
    expect(withinProject('/proj', '0c1d2e3f-aaaa-bbbb-cccc-000011112222', home)).toBe(true)
    rmSync(home, {recursive: true, force: true})
  })
})

describe('parseSessionMeta', () => {
  it('extracts model + token totals + last message from a transcript', () => {
    const jsonl = [
      JSON.stringify({type: 'system', session_id: 'tok', model: 'claude-opus-4-8'}),
      JSON.stringify({type: 'user', message: {content: 'hi there'}}),
      JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'the reply'}]}}),
      JSON.stringify({type: 'result', usage: {input_tokens: 10, output_tokens: 5}}),
    ].join('\n')
    const meta = parseSessionMeta('tok', jsonl, 123)
    expect(meta.model).toBe('claude-opus-4-8')
    expect(meta.updatedAt).toBe(123)
    expect(meta.totalTokens).toBe(15)
    expect(meta.lastMessage).toBe('the reply')
  })
})
