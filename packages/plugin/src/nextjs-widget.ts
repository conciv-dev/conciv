/// <reference lib="dom" />
// Client entry for instrumentation-client.ts: mount the conciv widget against the pinned engine port.
const port = process.env.NEXT_PUBLIC_CONCIV_PORT

function startWidget(): void {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  // Next has no bundler-side user-extension discovery yet (vite-first); mount with built-ins only.
  void import('@conciv/widget').then(({mountWidget}) => mountWidget([]))
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWidget, {once: true})
  } else {
    startWidget()
  }
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export {}
