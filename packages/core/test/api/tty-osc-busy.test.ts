import {describe, expect, it} from 'vitest'
import {createOscBusyTracker} from '../../src/api/tty/osc-busy.js'

const ESC = '\u001b'
const BEL = '\u0007'

describe('osc busy tracker', () => {
  it('is idle and unseen before any sequence', () => {
    const t = createOscBusyTracker()
    t.feed('plain output, no sequences')
    expect(t.busy()).toBe(false)
    expect(t.seen()).toBe(false)
  })

  it('flips busy on progress set and idle on clear', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4;3;${BEL}`)
    expect(t.busy()).toBe(true)
    expect(t.seen()).toBe(true)
    t.feed(`${ESC}]9;4;0;${BEL}`)
    expect(t.busy()).toBe(false)
  })

  it('handles a sequence split across chunks', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4`)
    t.feed(`;1;50${BEL}`)
    expect(t.busy()).toBe(true)
  })

  it('accepts the ST terminator', () => {
    const t = createOscBusyTracker()
    t.feed(`${ESC}]9;4;1;${ESC}\\`)
    expect(t.busy()).toBe(true)
  })

  it('notifies on change only', () => {
    const t = createOscBusyTracker()
    const states: boolean[] = []
    t.onChange((b) => states.push(b))
    t.feed(`${ESC}]9;4;1;${BEL}`)
    t.feed(`${ESC}]9;4;2;${BEL}`)
    t.feed(`${ESC}]9;4;0;${BEL}`)
    expect(states).toEqual([true, false])
  })
})
