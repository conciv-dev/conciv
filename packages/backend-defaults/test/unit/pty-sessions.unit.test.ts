import {describe, expect, vi} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {test} from '../utils/engine-parts.js'

describe('idle terminals', () => {
  test('a watched terminal stays open, and closes once nobody has watched it for the idle time', async ({
    ttySessions,
    fakeTimers,
  }) => {
    const ptys = ttySessions({env: {}, idleEvictMs: 60_000})
    const command = {bin: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], env: {}}
    const pty = await ptys.open('session-1', command, tempDir('pty-'), 'http://localhost:5173')
    fakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    const detach = pty.attach({data: () => {}, control: () => {}})

    vi.advanceTimersByTime(120_000)
    expect(ptys.get('session-1')).toBe(pty)

    detach()
    vi.advanceTimersByTime(59_999)
    expect(ptys.get('session-1')).toBe(pty)

    vi.advanceTimersByTime(1)
    expect(ptys.get('session-1')).toBeUndefined()
  })
})

describe('terminals whose processes end', () => {
  test('take a resize on every output chunk of a busy terminal until their exits arrive, then report the exits, ignore keys and close', async ({
    ttySessions,
  }) => {
    const ptys = ttySessions({env: {}})
    const cwd = tempDir('pty-')
    const ticking = 'const tick = () => process.stdout.write(".", () => setImmediate(tick)); tick()'
    const ticker = await ptys.open('ticker', {bin: process.execPath, args: ['-e', ticking], env: {}}, cwd, 'origin')
    const ending = await Promise.all(
      Array.from({length: 8}, (_, index) =>
        ptys.open(`session-${index}`, {bin: process.execPath, args: ['-e', 'process.exit(3)'], env: {}}, cwd, 'origin'),
      ),
    )
    const exits = ending.map((pty) => {
      const exit = Promise.withResolvers<number>()
      pty.attach({data: () => {}, control: (frame) => frame.type === 'exit' && exit.resolve(frame.code)})
      return exit.promise
    })
    const settled = Promise.withResolvers<void>()
    ticker.attach({
      data: () => {
        const alive = ending.filter((pty) => pty.exited() === null)
        try {
          for (const pty of alive) pty.resize(90, 20)
        } catch (error) {
          settled.reject(error)
        }
        if (alive.length === 0) settled.resolve()
      },
      control: () => {},
    })

    await settled.promise
    expect(await Promise.all(exits)).toEqual(ending.map(() => 3))
    for (const pty of ending) {
      expect(pty.exited()).toEqual({code: 3})
      pty.write('x')
      pty.interrupt()
      pty.inject('note')
      pty.resize(100, 30)
      pty.kill()
      expect(ptys.get(pty.sessionId)).toBeUndefined()
    }
  })
})
