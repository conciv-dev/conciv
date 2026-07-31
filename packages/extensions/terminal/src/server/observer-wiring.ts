import {isSessionId, type SendBlockCode, type SendConfirmCode, type SendVerdict} from '@conciv/protocol/chat-types'
import {makeSessionObserver, type SessionObserver} from '@conciv/session-observer/observer'
import {systemClock, type PresenceState} from '@conciv/session-observer/types'
import type {ServerApi} from '@conciv/extension'

export type TerminalObserver = SessionObserver & {
  sendVerdict(sessionId: string, force: boolean): SendVerdict
}

type Notice =
  | {kind: 'block'; code: SendBlockCode; message: string}
  | {kind: 'confirm'; code: SendConfirmCode; message: string}

const NOTICES: Record<Exclude<PresenceState, 'idle'>, Notice> = {
  launching: {
    kind: 'confirm',
    code: 'EXTERNAL_LAUNCHING',
    message: 'Your terminal session is still starting up.',
  },
  connected: {
    kind: 'confirm',
    code: 'EXTERNAL_CONNECTED',
    message: 'Claude is open in your terminal. Sending here may interleave the conversation.',
  },
  working: {
    kind: 'block',
    code: 'EXTERNAL_WORKING',
    message: 'Claude is working in your terminal right now. Wait for it to finish, or press Esc there to interrupt it.',
  },
  stale: {
    kind: 'confirm',
    code: 'EXTERNAL_STALE',
    message:
      'Claude may still be running a long task in your terminal — it hasn’t reported in for a few minutes. Sending now can interleave the two conversations.',
  },
}

export function createTerminalObserver(server: ServerApi<Record<never, never>>): TerminalObserver {
  const wire: (() => void)[] = []
  const observer = makeSessionObserver({
    clock: systemClock,
    wire,
    handleFor: async (sessionId) => {
      if (!isSessionId(sessionId)) return null
      const token = await server.sessions.resumeToken(sessionId)
      if (!token) return null
      return (await server.harness.observeTranscript?.(token)) ?? null
    },
    onStateChange: () => server.sessions.notifyChange(),
  })

  const sendVerdict = (sessionId: string, force: boolean): SendVerdict => {
    const {state} = observer.snapshot(sessionId)
    if (state === 'idle') return {allow: true}
    if (observer.sendPolicy(sessionId, force) === 'allow') return {allow: true}
    const notice = NOTICES[state]
    if (notice.kind === 'block') return {allow: false, kind: 'block', code: notice.code, message: notice.message}
    return {allow: false, kind: 'confirm', code: notice.code, message: notice.message}
  }

  wire.push(server.sessions.onLocalRun((sessionId, phase) => observer.localRun(sessionId, phase)))
  wire.push(server.sessions.onSessionDetached((sessionId) => observer.report(sessionId, {kind: 'detach'})))
  wire.push(server.sessions.onLaunch((sessionId) => observer.report(sessionId, {kind: 'launch'})))
  wire.push(server.sessions.onMcpRequest((sessionId) => observer.report(sessionId, {kind: 'mcp'})))
  wire.push(server.sessions.beforeSend((sessionId, {force}) => sendVerdict(sessionId, force)))

  return {...observer, sendVerdict}
}
