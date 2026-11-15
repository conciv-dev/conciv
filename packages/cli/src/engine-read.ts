import {checkEngines, type EngineRow} from '@conciv/db'
import {makeRpcClient} from '@conciv/contract'
import type {SessionId, TabOpen} from '@conciv/protocol/chat-types'

export const ENGINE_READ_MS = 2_000

export type Checked = Awaited<ReturnType<typeof checkEngines>>

export type Silent = Checked['unreachable']

export type TabAsk<Row = EngineRow> = {row: Row; answer: TabOpen | null; failure: unknown}

export function askAgain(home: string, silent: Silent): Promise<Checked> {
  return checkEngines(home, {timeoutMs: ENGINE_READ_MS, roots: silent.map((entry) => entry.root)})
}

export function silence(silent: Silent): string {
  return silent.map((entry) => `${entry.root} did not answer (${entry.error})`).join('; ')
}

export function askTab<Row extends {apiBase: string}>(
  row: Row,
  tab: SessionId,
  timeoutMs: number,
): Promise<TabAsk<Row>> {
  return makeRpcClient(row.apiBase)
    .tabs.get({sessionId: tab}, {signal: AbortSignal.timeout(timeoutMs)})
    .then(
      (answer): TabAsk<Row> => ({row, answer, failure: null}),
      (failure: unknown): TabAsk<Row> => ({row, answer: null, failure}),
    )
}

export function askTabs(rows: EngineRow[], tab: SessionId, timeoutMs: number): Promise<TabAsk[]> {
  return Promise.all(rows.map((row) => askTab(row, tab, timeoutMs)))
}
