import {ORPCError} from '@orpc/server'
import type {BrowserTab, BrowserTabList, BrowserTabOpen} from '@conciv/protocol/schema/browser-tab'
import {aborted, channel} from './fake-channel.js'
import type {FakeEngineHandlers} from './fake-types.js'

type OpenTab = {
  readonly sessionId: string
  readonly connectionId: string
  readonly tab: BrowserTab
  readonly focusedAt: number | null
  readonly ended: PromiseWithResolvers<'closed' | 'replaced'>
}

type TabsInput = {
  readonly exists: (sessionId: string) => boolean
  readonly now: () => number
  readonly publish: (type: string, data: Record<string, unknown>) => void
}

export function createTabs(input: TabsInput) {
  const open = new Map<string, OpenTab>()
  const changes = channel<{version: number}>()
  const version = {current: 0}
  const changed = (type: string, data: Record<string, unknown>): void => {
    input.publish(type, data)
    version.current += 1
    changes.push({version: version.current})
  }
  const focusedAt = (tab: BrowserTab, previous: OpenTab | undefined) =>
    tab.focused ? input.now() : (previous?.focusedAt ?? null)
  const owns = (entry: OpenTab | undefined, request: BrowserTabOpen) =>
    entry !== undefined && entry.sessionId === request.sessionId && entry.connectionId === request.connectionId
  const list = (sessionId: string): BrowserTabList => {
    const ordered = [...open.values()]
      .filter((entry) => entry.sessionId === sessionId)
      .toReversed()
      .toSorted((left, right) => (right.focusedAt ?? -1) - (left.focusedAt ?? -1))
    const first = ordered[0]
    const focusedTabId = first === undefined || first.focusedAt === null ? null : first.tab.id
    return {tabs: ordered.map((entry) => ({...entry.tab, focused: entry.tab.id === focusedTabId})), focusedTabId}
  }
  const handlers: FakeEngineHandlers['tabs'] = {
    open: async (request, call) => {
      if (!input.exists(request.sessionId)) throw new ORPCError('NOT_FOUND', {message: 'session not found'})
      const previous = open.get(request.tab.id)
      const entry: OpenTab = {
        sessionId: request.sessionId,
        connectionId: request.connectionId,
        tab: request.tab,
        focusedAt: focusedAt(request.tab, previous),
        ended: Promise.withResolvers(),
      }
      open.delete(request.tab.id)
      open.set(request.tab.id, entry)
      changed('tab.opened', {
        sessionID: request.sessionId,
        tabId: request.tab.id,
        connectionId: request.connectionId,
        tab: request.tab,
      })
      previous?.ended.resolve('replaced')
      const closed = call.signal === undefined ? new Promise<never>(() => undefined) : aborted(call.signal)
      const outcome = await Promise.race([entry.ended.promise, closed.then(() => 'closed' as const)])
      if (open.get(request.tab.id) === entry) {
        open.delete(request.tab.id)
        changed('tab.closed', {sessionID: request.sessionId, tabId: request.tab.id, connectionId: request.connectionId})
      }
      return outcome
    },
    state: (request) => {
      const entry = open.get(request.tab.id)
      if (entry === undefined || !owns(entry, request))
        throw new ORPCError('UNAVAILABLE', {message: 'The browser tab is not open on this engine.'})
      open.set(request.tab.id, {...entry, tab: request.tab, focusedAt: focusedAt(request.tab, entry)})
      changed('tab.updated', {sessionID: request.sessionId, tabId: request.tab.id, tab: request.tab})
      return {ok: true as const}
    },
    list: ({sessionId}) => list(sessionId),
    sessions: () => [...new Set([...open.values()].map((entry) => entry.sessionId))],
    changes: async function* (_request, call) {
      yield {version: version.current}
      yield* changes.read(call.signal)
    },
  }
  const forget = (sessionId: string): void =>
    [...open].forEach(([tabId, entry]) => {
      if (entry.sessionId !== sessionId) return
      open.delete(tabId)
      entry.ended.resolve('closed')
    })
  return {handlers, forget}
}
