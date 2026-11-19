import type {RpcClient} from '@conciv/contract'

export type PageQueryItem = {requestId: string; query: unknown}

type BrowserTabFocusReport = {focused: boolean; visible: boolean}

function browserTabFocus(): BrowserTabFocusReport {
  if (typeof document === 'undefined') return {focused: false, visible: false}
  return {focused: document.hasFocus(), visible: document.visibilityState === 'visible'}
}

function reportFocus(rpc: RpcClient, browserTab: string): void {
  rpc.page.focus({browserTab, ...browserTabFocus()}).catch((error: unknown) => {
    console.error('[conciv] the engine did not take the browser tab focus', error)
  })
}

function onFocusChange(report: () => void, signal: AbortSignal): void {
  if (typeof window === 'undefined') return
  window.addEventListener('focus', report, {signal})
  window.addEventListener('blur', report, {signal})
  document.addEventListener('visibilitychange', report, {signal})
}

export async function* pageQueries(rpc: RpcClient, abortSignal?: AbortSignal): AsyncGenerator<PageQueryItem> {
  const listening = new AbortController()
  const served: {browserTab: string | null} = {browserTab: null}
  onFocusChange(() => {
    if (served.browserTab !== null) reportFocus(rpc, served.browserTab)
  }, listening.signal)
  try {
    const stream = await rpc.page.queries({focus: browserTabFocus()}, {signal: abortSignal})
    for await (const item of stream) {
      if (item.kind === 'query') {
        yield {requestId: item.requestId, query: item.query}
        continue
      }
      served.browserTab = item.browserTab
      reportFocus(rpc, item.browserTab)
    }
  } catch (error) {
    if (abortSignal?.aborted !== true) throw error
  } finally {
    listening.abort()
  }
}
