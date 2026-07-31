import {describe, expect, it} from 'vitest'
import {
  candidateTitle,
  checkedLabel,
  isStale,
  metaLine,
  nothingRunning,
  optionsUnavailable,
  showAllLabel,
  subtitle,
  TRANSCRIPT_UNAVAILABLE,
  UNTITLED_SESSION,
} from '../src/composer/connect/connect-copy.js'
import {liveSession} from './helpers/live-session.js'

describe('the title a row carries', () => {
  it('uses the derived title when there is one', () => {
    expect(candidateTitle(liveSession())).toBe('rename the widget package')
  })

  it('calls an empty readable session brand new', () => {
    expect(candidateTitle(liveSession({title: '', messageCount: 0}))).toBe(UNTITLED_SESSION)
  })

  it('names the terminal instead of claiming a session with an unreadable transcript is brand new', () => {
    const unreadable = liveSession({title: '', messageCount: 0, historyStatus: 'unavailable'})
    expect(candidateTitle(unreadable)).toBe('terminal-1')
    expect(candidateTitle(unreadable)).not.toBe(UNTITLED_SESSION)
  })
})

describe('the meta line under a row title', () => {
  it('reads terminal, state and message count, timed from the last activity', () => {
    const line = metaLine(liveSession({messageCount: 12}))
    expect(line.lead).toBe('terminal-1 · idle · 12 messages')
    expect(line.timePrefix).toBe('active')
    expect(line.notes).toEqual([])
  })

  it('says started, not active, when nothing has been said yet', () => {
    const started = Date.now() - 90_000
    const line = metaLine(liveSession({messageCount: 0, startedAt: started}))
    expect(line.lead).toBe('terminal-1 · idle · 0 messages')
    expect(line.timePrefix).toBe('started')
    expect(line.at).toBe(started)
  })

  it('speaks of one message in the singular and groups long counts', () => {
    expect(metaLine(liveSession({messageCount: 1})).lead).toContain('1 message')
    expect(metaLine(liveSession({messageCount: 1})).lead).not.toContain('1 messages')
    expect(metaLine(liveSession({messageCount: 1204})).lead).toContain('1,204 messages')
  })

  it('reports working and a shell instead of a plain idle', () => {
    expect(metaLine(liveSession({working: true, status: 'busy'})).lead).toContain('· working ·')
    expect(metaLine(liveSession({status: 'shell'})).lead).toContain('· in a ! shell ·')
  })

  it('notes the one-time reload, the shell and an unreadable transcript', () => {
    expect(metaLine(liveSession({ready: false})).notes).toContain(
      'started before install — one reload in that terminal',
    )
    expect(metaLine(liveSession({status: 'shell'})).notes).toContain('exit the shell before connecting')
    expect(metaLine(liveSession({historyStatus: 'unavailable'})).notes).toContain(TRANSCRIPT_UNAVAILABLE)
  })
})

describe('what the picker says about the list as a whole', () => {
  it('has no subtitle to offer when nothing is running', () => {
    expect(subtitle(0, 'Claude')).toBeNull()
  })

  it('counts the running sessions in the singular and the plural', () => {
    expect(subtitle(1, 'Claude')).toContain('1 Claude session is running')
    expect(subtitle(3, 'Claude')).toContain('3 Claude sessions are running')
  })

  it('names the harness when there is nothing to pick', () => {
    expect(nothingRunning('Claude')).toBe('No Claude session is running here.')
  })
})

describe('how fresh the list is', () => {
  it('is not stale right after a check', () => {
    expect(isStale(1_000_000, 1_000_000 + 3_000)).toBe(false)
  })

  it('goes stale once nothing has come back for fifteen seconds', () => {
    expect(isStale(1_000_000, 1_000_000 + 15_001)).toBe(true)
  })

  it('never claims a freshness it does not have', () => {
    expect(checkedLabel(0)).toBeNull()
    expect(checkedLabel(1_000_000)).toEqual(new Date(1_000_000))
  })
})

it('counts the sessions it is hiding in the reader’s own grammar', () => {
  expect(showAllLabel(1)).toBe('Show all 1 session')
  expect(showAllLabel(11)).toBe('Show all 11 sessions')
  expect(showAllLabel(1_204)).toBe('Show all 1,204 sessions')
})

it('names the harness in front of it when its options cannot be read', () => {
  expect(optionsUnavailable('Codex')).toBe('Terminal options unavailable for Codex')
})
