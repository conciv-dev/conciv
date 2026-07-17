import {connectPorts} from '@conciv/protocol/connect-ports'

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export const CONNECT_PORTS = connectPorts()

export async function probeCore(
  token: string,
  ports: readonly number[],
  fetchLike: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const attempts = ports.map(async (port) => {
    const base = `http://127.0.0.1:${port}/t/${token}`
    const response = await fetchLike(`${base}/health`, {signal})
    if (!response.ok) throw new Error(`port ${port} unhealthy`)
    return base
  })
  return Promise.any(attempts).catch(() => null)
}

function ensureWidgetSettings(): void {
  if (document.querySelector('meta[name="pw-widget"]')) return
  const meta = document.createElement('meta')
  meta.name = 'pw-widget'
  meta.content = JSON.stringify({defaultOpen: true})
  document.head.appendChild(meta)
}

export function mountWidget(base: string): void {
  window.__CONCIV_API_BASE__ = base
  if (document.querySelector('script[data-conciv-embed]')) return
  ensureWidgetSettings()
  const script = document.createElement('script')
  script.src = '/conciv-widget.global.js'
  script.dataset.concivEmbed = 'true'
  document.body.appendChild(script)
  window.dispatchEvent(new Event('conciv:widget-mounted'))
}
