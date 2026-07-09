/// <reference lib="dom" />

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

function startWidget(): void {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`

  console.info('[conciv] widget UI removed pending the new conciv client (oRPC rewrite); /rpc API is live')
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
