import {describe, expect, it} from 'vitest'
import {DIAL_MAX_ENTRIES, makeDialLog} from '../../src/chat/dial-log.js'

function clock(start: number): {now: () => number; advance: (ms: number) => void} {
  let at = start
  return {
    now: () => at,
    advance: (ms) => {
      at += ms
    },
  }
}

describe('makeDialLog', () => {
  it('remembers a dial until the readiness window closes', () => {
    const time = clock(1_000)
    const log = makeDialLog(time.now)
    log.note('sess-a')
    expect(log.seen('sess-a')).toBe(true)
    time.advance(59_999)
    expect(log.seen('sess-a')).toBe(true)
    time.advance(1)
    expect(log.seen('sess-a')).toBe(false)
  })

  it('reports an id that never dialled as unseen', () => {
    const log = makeDialLog(clock(0).now)
    expect(log.seen('sess-missing')).toBe(false)
  })

  it('refreshes the window on a later dial', () => {
    const time = clock(0)
    const log = makeDialLog(time.now)
    log.note('sess-a')
    time.advance(50_000)
    log.note('sess-a')
    time.advance(50_000)
    expect(log.seen('sess-a')).toBe(true)
  })

  it('caps the log and evicts the oldest dials', () => {
    const log = makeDialLog(clock(0).now)
    for (let index = 0; index < 600; index += 1) log.note(`sess-${index}`)
    expect(log.seen('sess-599')).toBe(true)
    expect(log.seen(`sess-${600 - DIAL_MAX_ENTRIES}`)).toBe(true)
    expect(log.seen(`sess-${599 - DIAL_MAX_ENTRIES}`)).toBe(false)
    expect(log.seen('sess-0')).toBe(false)
  })

  it('drops expired dials so they cannot occupy the cap', () => {
    const time = clock(0)
    const log = makeDialLog(time.now)
    for (let index = 0; index < DIAL_MAX_ENTRIES; index += 1) log.note(`stale-${index}`)
    time.advance(60_000)
    for (let index = 0; index < DIAL_MAX_ENTRIES; index += 1) log.note(`fresh-${index}`)
    expect(log.seen('fresh-0')).toBe(true)
    expect(log.seen(`fresh-${DIAL_MAX_ENTRIES - 1}`)).toBe(true)
    expect(log.seen('stale-0')).toBe(false)
  })
})
