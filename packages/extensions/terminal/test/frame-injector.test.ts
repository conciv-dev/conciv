import {describe, expect, it} from 'vitest'
import {createFrameInjector} from '../src/server/frame-injector.js'

const BEGIN = '\u001b[?2026h'
const END = '\u001b[?2026l'

function collect(): {out: string[]; write: (chunk: string) => void} {
  const out: string[] = []
  return {out, write: (chunk) => out.push(chunk)}
}

describe('frame injector', () => {
  it('forwards pty chunks verbatim', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed('hello')
    expect(out).toEqual(['hello'])
  })

  it('injects immediately while idle', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.inject('note')
    expect(out).toEqual(['\r\nnote\r\n'])
  })

  it('defers injection until the frame closes', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(`${BEGIN}painting`)
    injector.inject('note')
    expect(out).toEqual([`${BEGIN}painting`])
    expect(injector.pending()).toBe(1)
    injector.feed(`more${END}`)
    expect(out).toEqual([`${BEGIN}painting`, `more${END}`, '\r\nnote\r\n'])
    expect(injector.pending()).toBe(0)
  })

  it('handles a marker split across chunks', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed('\u001b[?20')
    injector.feed('26hframe')
    injector.inject('note')
    expect(out.join('')).not.toContain('note')
    injector.feed(END)
    expect(out.join('')).toContain('\r\nnote\r\n')
  })

  it('flushes queued injections in order', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(BEGIN)
    injector.inject('one')
    injector.inject('two')
    injector.feed(END)
    expect(out.join('')).toContain('\r\none\r\n\r\ntwo\r\n')
  })

  it('keeps SGR styling but strips cursor and OSC sequences', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.inject('\u001b[32mok\u001b[0m \u001b[2Amoved \u001b]0;title\u0007done')
    expect(out.join('')).toBe('\r\n\u001b[32mok\u001b[0m moved done\r\n')
  })

  it('uses the last marker in a chunk to decide state', () => {
    const {out, write} = collect()
    const injector = createFrameInjector(write)
    injector.feed(`${BEGIN}a${END}b${BEGIN}`)
    injector.inject('note')
    expect(out.join('')).not.toContain('note')
    injector.feed(`c${END}d${BEGIN}e${END}`)
    expect(out.join('')).toContain('note')
  })
})
