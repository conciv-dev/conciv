/// <reference lib="dom" />
// Client entry for instrumentation-client.ts: mount the aidx widget against the pinned engine port.
const port = process.env.NEXT_PUBLIC_AIDX_PORT

function startWidget(): void {
  window.__AIDX_API_BASE__ = `http://127.0.0.1:${port}`
  void import('@aidx/widget')
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
    __AIDX_API_BASE__?: string
  }
}

export {}
