import {afterEach, describe, expect, it} from 'vitest'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySessions, type TtySink} from '../src/server/pty-sessions.js'
import {until} from '@conciv/harness-testkit'

const BASH = {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}

type SinkUpdate = {kind: 'data'; text: string} | {kind: 'control'; frame: TtyServerControl}

type Collected = {chunks: string[]; controls: TtyServerControl[]; sink: TtySink}

function collect(onUpdate: (update: SinkUpdate) => void = () => {}): Collected {
  const chunks: string[] = []
  const controls: TtyServerControl[] = []
  return {
    chunks,
    controls,
    sink: {
      data: (chunk) => {
        chunks.push(chunk)
        onUpdate({kind: 'data', text: chunks.join('')})
      },
      control: (frame) => {
        controls.push(frame)
        onUpdate({kind: 'control', frame})
      },
    },
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
    const echoed = Promise.withResolvers<string>()
    const {sink} = collect((update) => {
      if (update.kind === 'data' && update.text.includes('tty-roundtrip-42')) echoed.resolve(update.text)
    })
    s.events(sink)
    s.write('echo tty-roundtrip-$((40+2))\r')
    expect(await echoed.promise).toContain('tty-roundtrip-42')
  })

  it('replays buffered bytes to a late attacher', async () => {
    const sessions = make()
    const s = sessions.open('s2', BASH, process.cwd())
    const marked = Promise.withResolvers<string>()
    const early = collect((update) => {
      if (update.kind === 'data' && update.text.includes('replay-marker')) marked.resolve(update.text)
    })
    const detach = s.events(early.sink)
    s.write('echo replay-marker\r')
    expect(await marked.promise).toContain('replay-marker')
    detach()
    const late = collect()
    s.events(late.sink)
    expect(late.chunks.join('')).toContain('replay-marker')
  })

  it('applies resize', async () => {
    const sessions = make()
    const s = sessions.open('s3', BASH, process.cwd())
    const sized = Promise.withResolvers<string>()
    const {sink} = collect((update) => {
      if (update.kind === 'data' && update.text.includes('41 97')) sized.resolve(update.text)
    })
    s.events(sink)
    s.resize(97, 41)
    s.write('stty size\r')
    expect(await sized.promise).toContain('41 97')
  })

  it('reports exit to sinks and via exited()', async () => {
    const sessions = make()
    const s = sessions.open('s4', BASH, process.cwd())
    const exited = Promise.withResolvers<TtyServerControl>()
    const {controls, sink} = collect((update) => {
      if (update.kind === 'control' && update.frame.type === 'exit') exited.resolve(update.frame)
    })
    s.events(sink)
    s.write('exit 3\r')
    expect(await exited.promise).toEqual({type: 'exit', code: 3})
    expect(s.exited()).toEqual({code: 3})
    expect(controls.some((f) => f.type === 'exit' && f.code === 3)).toBe(true)
  })

  it('surfaces a spawn failure as an error control frame, not a crash', async () => {
    const sessions = make()
    const s = sessions.open('s6', {bin: '/nonexistent/definitely-missing-bin', args: [], env: {}}, process.cwd())
    const failed = Promise.withResolvers<TtyServerControl>()
    const {sink} = collect((update) => {
      if (update.kind !== 'control') return
      if (update.frame.type === 'error' || update.frame.type === 'exit') failed.resolve(update.frame)
    })
    s.events(sink)
    expect((await failed.promise).type).toMatch(/^(error|exit)$/)
  })

  it('injects into live sinks and the replay buffer', async () => {
    const sessions = make()
    const s = sessions.open('s7', BASH, process.cwd())
    const injected = Promise.withResolvers<string>()
    const live = collect((update) => {
      if (update.kind === 'data' && update.text.includes('\r\nconciv marker\r\n')) injected.resolve(update.text)
    })
    const detach = s.events(live.sink)
    s.inject('conciv marker')
    expect(await injected.promise).toContain('\r\nconciv marker\r\n')
    detach()
    const late = collect()
    s.events(late.sink)
    expect(late.chunks.join('')).toContain('\r\nconciv marker\r\n')
  })

  it('interrupt() sends ctrl-c that aborts the running foreground command', async () => {
    const sessions = make()
    const s = sessions.open('s8', BASH, process.cwd())
    const started = Promise.withResolvers<string>()
    const resumed = Promise.withResolvers<string>()
    const {sink} = collect((update) => {
      if (update.kind !== 'data') return
      if (update.text.includes('sleep 30')) started.resolve(update.text)
      if (update.text.includes('B6K')) resumed.resolve(update.text)
    })
    s.events(sink)
    s.write('sleep 30 && echo S$((5+5))P\r')
    await started.promise
    await new Promise((r) => setTimeout(r, 300))
    s.interrupt()
    s.write('echo B$((3+3))K\r')
    expect(await resumed.promise).not.toContain('S10P')
  })

  it('broadcasts OSC 9;4 busy transitions to attached sinks', async () => {
    const sessions = make()
    const s = sessions.open('s9', BASH, process.cwd())
    const turnedBusy = Promise.withResolvers<TtyServerControl>()
    const turnedIdle = Promise.withResolvers<TtyServerControl>()
    const {controls, sink} = collect((update) => {
      if (update.kind !== 'control' || update.frame.type !== 'busy') return
      if (update.frame.busy) turnedBusy.resolve(update.frame)
      if (!update.frame.busy && controls.some((f) => f.type === 'busy' && f.busy)) turnedIdle.resolve(update.frame)
    })
    s.events(sink)
    expect(controls).toEqual([{type: 'busy', busy: false}])
    s.write('printf "\\033]9;4;1\\007"\r')
    expect(await turnedBusy.promise).toEqual({type: 'busy', busy: true})
    expect(s.busy()).toBe(true)
    s.write('printf "\\033]9;4;0\\007"\r')
    expect(await turnedIdle.promise).toEqual({type: 'busy', busy: false})
    expect(s.busy()).toBe(false)
    expect(controls.filter((f) => f.type === 'busy').map((f) => f.busy)).toEqual([false, true, false])
  })

  it('tells a late attacher the current busy state', async () => {
    const sessions = make()
    const s = sessions.open('s10', BASH, process.cwd())
    const turnedBusy = Promise.withResolvers<TtyServerControl>()
    const early = collect((update) => {
      if (update.kind === 'control' && update.frame.type === 'busy' && update.frame.busy) {
        turnedBusy.resolve(update.frame)
      }
    })
    const detach = s.events(early.sink)
    s.write('printf "\\033]9;4;1\\007"\r')
    await turnedBusy.promise
    expect(s.busy()).toBe(true)
    detach()
    const late = collect()
    s.events(late.sink)
    expect(late.controls.some((f) => f.type === 'busy' && f.busy)).toBe(true)
  })

  it('debounces rapid interrupts so a double-Escape cannot send two ctrl-c', async () => {
    const sessions = make()
    const s = sessions.open('s11', BASH, process.cwd())
    const started = Promise.withResolvers<string>()
    const resumed = Promise.withResolvers<string>()
    const {chunks, sink} = collect((update) => {
      if (update.kind !== 'data') return
      if (update.text.includes('sleep 30')) started.resolve(update.text)
      if (update.text.includes('D4N')) resumed.resolve(update.text)
    })
    s.events(sink)
    s.write('sleep 30\r')
    await started.promise
    await new Promise((r) => setTimeout(r, 300))
    s.interrupt()
    s.interrupt()
    s.write('echo D$((2+2))N\r')
    await resumed.promise
    const echoed = chunks.join('').match(/\^C/g) ?? []
    expect(echoed.length).toBe(1)
  })

  it('evicts an idle session with no sinks', async () => {
    const sessions = make({idleEvictMs: 100})
    const s = sessions.open('s5', BASH, process.cwd())
    const detach = s.events(collect().sink)
    detach()
    await until(() => sessions.get('s5') === undefined, {hangGuardMs: 3000})
  })
})
