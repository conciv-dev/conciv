import {afterEach, describe, expect, it} from 'vitest'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySessions, type TtySink} from '../src/server/pty-sessions.js'
import {until} from '@conciv/harness-testkit'

const BASH = {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}

type Collected = {chunks: string[]; controls: TtyServerControl[]; sink: TtySink}

function collect(): Collected {
  const chunks: string[] = []
  const controls: TtyServerControl[] = []
  return {chunks, controls, sink: {data: (c) => chunks.push(c), control: (f) => controls.push(f)}}
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

  it('injects into live sinks and the replay buffer', async () => {
    const sessions = make()
    const s = sessions.open('s7', BASH, process.cwd())
    const live = collect()
    const detach = s.attach(live.sink)
    s.inject('conciv marker')
    await until(() => live.chunks.join('').includes('\r\nconciv marker\r\n'))
    detach()
    const late = collect()
    s.attach(late.sink)
    expect(late.chunks.join('')).toContain('\r\nconciv marker\r\n')
  })

  it('interrupt() sends ctrl-c that aborts the running foreground command', async () => {
    const sessions = make()
    const s = sessions.open('s8', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.write('sleep 30 && echo S$((5+5))P\r')
    await until(() => chunks.join('').includes('sleep 30'))
    await new Promise((r) => setTimeout(r, 300))
    s.interrupt()
    s.write('echo B$((3+3))K\r')
    await until(() => chunks.join('').includes('B6K'), {hangGuardMs: 3000})
    expect(chunks.join('')).not.toContain('S10P')
  })

  it('broadcasts OSC 9;4 busy transitions to attached sinks', async () => {
    const sessions = make()
    const s = sessions.open('s9', BASH, process.cwd())
    const {controls, sink} = collect()
    s.attach(sink)
    await until(() => controls.some((f) => f.type === 'busy' && !f.busy))
    s.write('printf "\\033]9;4;1\\007"\r')
    await until(() => controls.some((f) => f.type === 'busy' && f.busy))
    await until(() => s.busy())
    s.write('printf "\\033]9;4;0\\007"\r')
    await until(() => !s.busy())
    expect(controls.filter((f) => f.type === 'busy').map((f) => f.busy)).toEqual([false, true, false])
  })

  it('tells a late attacher the current busy state', async () => {
    const sessions = make()
    const s = sessions.open('s10', BASH, process.cwd())
    const early = collect()
    const detach = s.attach(early.sink)
    s.write('printf "\\033]9;4;1\\007"\r')
    await until(() => s.busy())
    detach()
    const late = collect()
    s.attach(late.sink)
    expect(late.controls.some((f) => f.type === 'busy' && f.busy)).toBe(true)
  })

  it('debounces rapid interrupts so a double-Escape cannot send two ctrl-c', async () => {
    const sessions = make()
    const s = sessions.open('s11', BASH, process.cwd())
    const {chunks, sink} = collect()
    s.attach(sink)
    s.write('sleep 30\r')
    await until(() => chunks.join('').includes('sleep 30'))
    await new Promise((r) => setTimeout(r, 300))
    s.interrupt()
    s.interrupt()
    s.write('echo D$((2+2))N\r')
    await until(() => chunks.join('').includes('D4N'), {hangGuardMs: 3000})
    const echoed = chunks.join('').match(/\^C/g) ?? []
    expect(echoed.length).toBe(1)
  })

  it('evicts an idle session with no sinks', async () => {
    const sessions = make({idleEvictMs: 100})
    const s = sessions.open('s5', BASH, process.cwd())
    const detach = s.attach(collect().sink)
    detach()
    await until(() => sessions.get('s5') === undefined, {hangGuardMs: 3000})
  })
})
