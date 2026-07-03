import {describe, expect, it} from 'vitest'
import {TtyClientControlSchema, TtyServerControlSchema} from '../src/terminal-types.js'

describe('terminal types', () => {
  it('parses client control frames', () => {
    expect(TtyClientControlSchema.parse({type: 'resize', cols: 120, rows: 32})).toEqual({
      type: 'resize',
      cols: 120,
      rows: 32,
    })
    expect(TtyClientControlSchema.safeParse({type: 'resize', cols: 'x'}).success).toBe(false)
  })

  it('parses server control frames', () => {
    expect(TtyServerControlSchema.parse({type: 'exit', code: 0})).toEqual({type: 'exit', code: 0})
    expect(TtyServerControlSchema.parse({type: 'busy', busy: true})).toEqual({type: 'busy', busy: true})
    expect(TtyServerControlSchema.parse({type: 'error', message: 'boom'})).toEqual({type: 'error', message: 'boom'})
  })
})
