import {makeRpcClient} from '@conciv/contract'
import type {NavigationState} from '@conciv/protocol/chat-types'
import {connectPorts} from '@conciv/protocol/connect-ports'

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export const CONNECT_PORTS = connectPorts()

export async function findCore(
  token: string,
  ports: readonly number[],
  fetchLike: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const port of ports) {
    const base = `http://127.0.0.1:${port}/t/${token}`
    try {
      const response = await fetchLike(`${base}/health`, {signal})
      if (response.ok) return base
    } catch {
      if (signal?.aborted) return null
    }
  }
  return null
}

export function mountWidget(base: string): void {
  window.__CONCIV_API_BASE__ = base
  if (document.querySelector('script[data-conciv-embed]')) return
  const script = document.createElement('script')
  script.src = '/conciv-widget.global.js'
  script.dataset.concivEmbed = 'true'
  document.body.appendChild(script)
  window.dispatchEvent(new Event('conciv:widget-mounted'))
}

export function openPanelNavigation(sessionId: string): NavigationState {
  return {entries: [{href: `/panel/${sessionId}?open=true`}], index: 0}
}

export async function seedOpenPanel(base: string): Promise<void> {
  const rpc = makeRpcClient(base)
  const {sessionId} = await rpc.sessions.resolve({})
  await rpc.navigation.set(openPanelNavigation(sessionId))
}
