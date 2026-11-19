/// <reference lib="dom" />

async function mountWidget(): Promise<void> {
  const {mountConciv} = await import('@conciv/embed')
  await mountConciv()
}

function startWhenReady(): void {
  mountWidget().catch((error) => console.error('[conciv] widget failed to start', error))
}

export function isEnginePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

function canMount(port: number): boolean {
  return typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && isEnginePort(port)
}

export function startConcivWidget(port: number): void {
  if (!canMount(port)) return
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  if (document.readyState !== 'loading') return startWhenReady()
  document.addEventListener('DOMContentLoaded', startWhenReady, {once: true})
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}
