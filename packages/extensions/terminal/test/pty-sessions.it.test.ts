import {afterEach, describe, expect, it} from 'vitest'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySessions, type TtySink} from '../src/server/pty-sessions.js'

const BASH = {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}

type Collected = {chunks: string[]; controls: TtyServerControl[]; sink: TtySink}

function collect(): Collected {
  const chunks: string[] = []
  const controls: TtyServerControl[] = []
  return {chunks, controls, sink: {data: (c) => chunks.push(c), control: (f) => controls.push(f)}}
}

const until = async (cond: () => boolean, ms = 5000): Promise<void> => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('pty sessions', () => {
  const cleanups: TtySessions[] = []

  const make = (opts?: Parameters<typeof createTtySessions>[0]): TtySessions => {
    const sessions = createTtySessions(opts)
    cleanups.push(sessions)
    return sessions
  }

  afterEach(() => {
    for (const sessions of cleanups.splice(0)) sessions.shutdown()
  })

  it('streams output and echoes input through a real pty', async () => {
    const sessions = make()
    const s = sessions.open('s1', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.write('echo tty-roundtrip-$((40+2))\r')
    await until(() => chunks.join('').includes('tty-roundtrip-42'))
  })

  it('replays buffered bytes to a late attacher', async () => {
    const sessions = make()
    const s = sessions.open('s2', BASH, process.cwd())
    const early = collect()
    const detach = s.attach(early.sink)
    s.write('echo replay-marker\r')
    await until(() => early.chunks.join('').includes('replay-marker'))
    detach()
    const late = collect()
    s.attach(late.sink)
    expect(late.chunks.join('')).toContain('replay-marker')
  })

  it('applies resize', async () => {
    const sessions = make()
    const s = sessions.open('s3', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.resize(97, 41)
    s.write('stty size\r')
    await until(() => chunks.join('').includes('41 97'))
  })

  it('reports exit to sinks and via exited()', async () => {
    const sessions = make()
    const s = sessions.open('s4', BASH, process.cwd())
    const {controls, sink} = collect()
    s.attach(sink)
    s.write('exit 3\r')
    await until(() => s.exited() !== null)
    expect(s.exited()).toEqual({code: 3})
    expect(controls.some((f) => f.type === 'exit' && f.code === 3)).toBe(true)
  })

  it('surfaces a spawn failure as an error control frame, not a crash', async () => {
    const sessions = make()
    const s = sessions.open('s6', {bin: '/nonexistent/definitely-missing-bin', args: [], env: {}}, process.cwd())
    const {controls, sink} = collect()
    s.attach(sink)
    await until(() => controls.some((f) => f.type === 'error' || f.type === 'exit'))
  })

  it('evicts an idle session with no sinks', async () => {
    const sessions = make({idleEvictMs: 100})
    const s = sessions.open('s5', BASH, process.cwd())
    const detach = s.attach(collect().sink)
    detach()
    await until(() => sessions.get('s5') === undefined, 3000)
  })
})
