declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export const CONNECT_PORTS = [4732, 4733, 4734, 4735, 4736, 4737, 4738, 4739, 4740, 4741]

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
  if (document.querySelector('script[data-conciv-embed]')) return
  window.__CONCIV_API_BASE__ = base
  const script = document.createElement('script')
  script.src = '/conciv-widget.global.js'
  script.dataset.concivEmbed = 'true'
  document.body.appendChild(script)
}
