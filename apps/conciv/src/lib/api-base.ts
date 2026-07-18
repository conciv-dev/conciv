declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function queryCore(): string {
  const raw = new URLSearchParams(window.location.search).get('core')
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (loopback || url.origin === window.location.origin) return raw
  } catch {}
  console.warn('[conciv] ignoring non-loopback cross-origin ?core= api base')
  return ''
}

export function resolveApiBase(): string {
  return window.__CONCIV_API_BASE__ ?? (metaContent('pw-api-base') || queryCore()) ?? ''
}
