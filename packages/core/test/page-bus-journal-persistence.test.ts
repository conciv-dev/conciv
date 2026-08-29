import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import {makeJournal} from '../src/page-bus.js'

const SESSION_A = SessionId.parse('conciv_journal_a')
const SESSION_B = SessionId.parse('conciv_journal_b')

describe('the page-change journal is DB-backed', () => {
  it('keeps each session isolated: list and clear never touch another session', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-journal-'))
    const journal = makeJournal(openDb(stateRoot))

    await journal.append(SESSION_A, {verb: 'page_click', selector: '.a', args: {}}, 1)
    await journal.append(SESSION_B, {verb: 'page_click', selector: '.b', args: {}}, 2)

    expect(await journal.list(SESSION_A)).toMatchObject([{verb: 'page_click', selector: '.a'}])
    expect(await journal.list(SESSION_B)).toMatchObject([{verb: 'page_click', selector: '.b'}])

    await journal.clear(SESSION_A)

    expect(await journal.list(SESSION_A)).toEqual([])
    expect(await journal.list(SESSION_B)).toMatchObject([{verb: 'page_click', selector: '.b'}])
  })

  it('survives an engine restart: entries written before a fresh db handle are still readable after', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-journal-restart-'))
    const beforeRestart = makeJournal(openDb(stateRoot))
    await beforeRestart.append(SESSION_A, {verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}, 10)

    const afterRestart = makeJournal(openDb(stateRoot))
    expect(await afterRestart.list(SESSION_A)).toMatchObject([
      {verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}},
    ])
  })
})
