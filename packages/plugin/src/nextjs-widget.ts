/// <reference lib="dom" />

const port = process.env.NEXT_PUBLIC_CONCIV_PORT
const configuredWidgetUrl = process.env.NEXT_PUBLIC_CONCIV_WIDGET_URL

function startWidget(): void {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  const script = document.createElement('script')
  script.src = configuredWidgetUrl ?? `http://127.0.0.1:${port}/widget.js`
  document.body.appendChild(script)
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => startWidget(), {once: true})
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
