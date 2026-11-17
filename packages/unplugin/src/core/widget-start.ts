/// <reference lib="dom" />

async function mountWidget(): Promise<void> {
  const [{entries}, {mountConciv}, {dedupeExtensions}] = await Promise.all([
    import('@conciv/app-extensions'),
    import('@conciv/embed'),
    import('@conciv/extension-compiler/dedupe'),
  ])
  const picked = dedupeExtensions(entries)
  for (const drop of picked.dropped) console.warn('conciv extension dropped:', drop.source, drop.reason)
  await mountConciv(picked.extensions)
}

function startWhenReady(): void {
  mountWidget().catch((error) => console.error('[conciv] widget failed to start', error))
}

export function startConcivWidget(port: number): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return
  if (!Number.isInteger(port) || port < 1 || port > 65535) return
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  if (document.readyState !== 'loading') return startWhenReady()
  document.addEventListener('DOMContentLoaded', startWhenReady, {once: true})
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}
