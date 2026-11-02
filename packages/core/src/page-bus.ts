import {PAGE_QUERY_FUNCTION, pageFailure, PageOutcomeSchema, type PageQuery} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {appendPageChange, clearPageChanges, pageChangesFor, type ConcivDb} from '@conciv/db'

export type ChangeEntry = {
  seq: number
  ts: number
  verb: string
  ref?: string
  selector?: string
  args: Record<string, unknown>
}

export type Journal = {
  append: (sessionId: SessionId, entry: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number) => Promise<ChangeEntry>
  list: (sessionId: SessionId) => Promise<ChangeEntry[]>
  clear: (sessionId: SessionId) => Promise<void>
}

export function makeJournal(db: ConcivDb): Journal {
  return {
    append: (sessionId, entry, ts) => appendPageChange(db, sessionId, entry, ts),
    list: (sessionId) => pageChangesFor(db, sessionId),
    clear: (sessionId) => clearPageChanges(db, sessionId),
  }
}

declare module 'devframe/types' {
  interface DevframeRpcClientFunctions {
    [PAGE_QUERY_FUNCTION]: (query: PageQuery) => Promise<unknown>
  }
}

export type PageAnswer = {result: Record<string, unknown>; capture?: PageCaptureBundle}

export type PageTab = {
  id: number
  live: () => boolean
  query: (query: PageQuery) => Promise<unknown>
}

export type PageTabs = {
  ask: (sessionId: SessionId, query: PageQuery) => Promise<PageAnswer>
  connected: (sessionId: SessionId) => boolean
  anyConnected: () => boolean
  join: (sessionId: SessionId, tab: PageTab) => void
  leave: (sessionId: SessionId, tabId: number) => void
}

export type CaptureSink = (params: {
  sessionId: SessionId
  toolCallId: string
  bundle: PageCaptureBundle
}) => Promise<void>

export type PageEnv = {journal: Journal; root: string; tabs: PageTabs; storeCapture: CaptureSink}

function firstReply(tabs: PageTab[], query: PageQuery, timeoutMs: number): Promise<unknown> {
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(
    () => expired.reject(pageFailure('timeout', 'page did not reply (no widget connected?)')),
    timeoutMs,
  )
  const answered = Promise.any(tabs.map((tab) => tab.query(query))).catch(() => expired.promise)
  return Promise.race([answered, expired.promise]).finally(() => clearTimeout(timer))
}

export function makePageTabs(timeoutMs = 5000): PageTabs {
  const bySession = new Map<SessionId, Map<number, PageTab>>()

  const liveTabs = (sessionId: SessionId): PageTab[] => {
    const tabs = bySession.get(sessionId)
    if (tabs === undefined) return []
    for (const tab of tabs.values()) if (!tab.live()) tabs.delete(tab.id)
    const live = [...tabs.values()]
    if (tabs.size === 0) bySession.delete(sessionId)
    return live
  }

  async function ask(sessionId: SessionId, query: PageQuery): Promise<PageAnswer> {
    const tabs = liveTabs(sessionId)
    if (tabs.length === 0) throw pageFailure('no-widget', `no widget connected to session "${sessionId}"`)
    const declared = query.input['timeout']
    const ms = typeof declared === 'number' ? declared + 1000 : timeoutMs
    const parsed = PageOutcomeSchema.safeParse(await firstReply(tabs, query, ms))
    if (!parsed.success) throw pageFailure('handler-error', 'the page sent a reply that does not parse')
    const outcome = parsed.data
    if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
    if (outcome.capture === undefined) return {result: outcome.result}
    return {result: outcome.result, capture: outcome.capture}
  }

  return {
    ask,
    connected: (sessionId) => liveTabs(sessionId).length > 0,
    anyConnected: () => [...bySession.keys()].some((sessionId) => liveTabs(sessionId).length > 0),
    join: (sessionId, tab) => {
      const tabs = bySession.get(sessionId) ?? new Map<number, PageTab>()
      tabs.set(tab.id, tab)
      bySession.set(sessionId, tabs)
    },
    leave: (sessionId, tabId) => {
      bySession.get(sessionId)?.delete(tabId)
    },
  }
}
