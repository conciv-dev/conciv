import {isSessionId} from '@conciv/protocol/chat-types'
import type {SendVerdict} from '@conciv/protocol/chat-types'
import {makePresence, type PresenceSignal, type PresenceSnapshot} from '@conciv/session-presence/presence'
import {makeTranscriptWatch} from '@conciv/session-presence/transcript-watch'
import type {ServerApi} from '@conciv/extension'

export type PresenceSink = (snapshot: PresenceSnapshot) => void

export type TerminalPresence = {
  report(sessionId: string, signal: PresenceSignal): void
  snapshot(sessionId: string): PresenceSnapshot
  sendVerdict(sessionId: string, force: boolean): SendVerdict
  subscribe(sessionId: string, sink: PresenceSink): () => void
  start(): void
  dispose(): void
}

const STALE_TICK_MS = 5_000

const WORKING_MESSAGE = 'Claude is working in your terminal. Wait for it to finish.'
const CONNECTED_MESSAGE = 'Claude is open in your terminal. Sending here may interleave the conversation.'

function sameSnapshot(left: PresenceSnapshot, right: PresenceSnapshot): boolean {
  return left.state === right.state && left.source === right.source && left.lastSeenAt === right.lastSeenAt
}

export function createTerminalPresence(server: ServerApi<Record<never, never>>): TerminalPresence {
  const sinks = new Map<string, Set<PresenceSink>>()
  const emitted = new Map<string, PresenceSnapshot>()
  const stops: (() => void)[] = []

  function broadcast(sessionId: string): void {
    const listeners = sinks.get(sessionId)
    if (!listeners || listeners.size === 0) return
    const next = presence.snapshot(sessionId)
    const previous = emitted.get(sessionId)
    if (previous && sameSnapshot(previous, next)) return
    emitted.set(sessionId, next)
    for (const sink of listeners) sink(next)
  }

  const presence = makePresence({
    now: Date.now,
    onChange: (sessionId) => {
      server.sessions.notifyChange()
      broadcast(sessionId)
    },
  })

  const watch = makeTranscriptWatch({
    keys: () => presence.active(),
    stat: async (sessionId) => {
      if (!isSessionId(sessionId)) return null
      const token = await server.sessions.resumeToken(sessionId)
      if (!token) return null
      return (await server.harness.transcriptStat?.(token)) ?? null
    },
    onChange: (sessionId) => presence.report(sessionId, {kind: 'transcript'}),
  })

  return {
    report: (sessionId, signal) => presence.report(sessionId, signal),
    snapshot: (sessionId) => presence.snapshot(sessionId),
    sendVerdict: (sessionId, force) => {
      const policy = presence.sendPolicy(sessionId, force)
      if (policy === 'block') return {allow: false, code: 'EXTERNAL_ACTIVE', message: WORKING_MESSAGE}
      if (policy === 'confirm') return {allow: false, code: 'EXTERNAL_ACTIVE', message: CONNECTED_MESSAGE}
      return {allow: true}
    },
    subscribe(sessionId, sink) {
      const listeners = sinks.get(sessionId) ?? new Set<PresenceSink>()
      listeners.add(sink)
      sinks.set(sessionId, listeners)
      return () => {
        listeners.delete(sink)
        if (listeners.size > 0) return
        sinks.delete(sessionId)
        emitted.delete(sessionId)
      }
    },
    start() {
      stops.push(watch.start())
      const timer = setInterval(() => {
        for (const sessionId of sinks.keys()) broadcast(sessionId)
      }, STALE_TICK_MS)
      timer.unref?.()
      stops.push(() => clearInterval(timer))
    },
    dispose() {
      for (const stop of stops) stop()
      stops.length = 0
      sinks.clear()
      emitted.clear()
    },
  }
}
