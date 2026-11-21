import {describe, expect, test, vi} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {createTtySessions} from './pty-sessions.js'

describe('idle terminals', () => {
  test('a watched terminal stays open, and closes once nobody has watched it for the idle time', async () => {
    const ptys = createTtySessions({env: {}, idleEvictMs: 60_000})
    const command = {bin: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], env: {}}
    const pty = await ptys.open('session-1', command, tempDir('pty-'), 'http://localhost:5173')
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    const detach = pty.attach({data: () => {}, control: () => {}})

    vi.advanceTimersByTime(120_000)
    expect(ptys.get('session-1')).toBe(pty)

    detach()
    vi.advanceTimersByTime(59_999)
    expect(ptys.get('session-1')).toBe(pty)

    vi.advanceTimersByTime(1)
    expect(ptys.get('session-1')).toBeUndefined()
    vi.useRealTimers()
    ptys.shutdown()
  })
})
