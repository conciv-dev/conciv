import {describe, expect, it} from 'vitest'
import {plainLines} from '../src/cli.js'

describe('plainLines', () => {
  it('keeps the greppable connected line for agent-driven runs', () => {
    expect(plainLines({type: 'started', port: 4732, harness: 'claude'})).toEqual([
      'connected: conciv core on 127.0.0.1:4732 (harness: claude)',
      'return to your browser tab — keep this command running',
    ])
  })
  it('renders both seed outcomes', () => {
    expect(plainLines({type: 'seeded', seeded: true})).toEqual(['workspace seeded with the landing-page source'])
    expect(plainLines({type: 'seeded', seeded: false})).toEqual(['no source manifest found — continuing unseeded'])
  })
  it('announces browser pairing', () => {
    expect(plainLines({type: 'client-connected'})).toEqual(['browser paired — the widget is live'])
  })
})
