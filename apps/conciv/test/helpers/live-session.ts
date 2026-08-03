import type {LiveSession} from '@conciv/contract'

export function liveSession(over: Partial<LiveSession> = {}): LiveSession {
  return {
    sessionId: 'sess-1',
    pid: 4242,
    cwd: '/repo',
    name: 'terminal-1',
    status: 'idle',
    startedAt: Date.now() - 600_000,
    relation: 'same',
    ready: true,
    historyStatus: 'ok',
    title: 'rename the widget package',
    messageCount: 12,
    lastActivityAt: Date.now() - 60_000,
    working: false,
    tail: [
      {role: 'assistant', text: 'Looking at the manifests now.'},
      {role: 'tool', text: '', toolName: 'Read', toolResult: 'package.json read'},
    ],
    ...over,
  }
}
