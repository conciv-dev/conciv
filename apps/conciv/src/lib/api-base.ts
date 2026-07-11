declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

export function resolveApiBase(): string {
  return (
    window.__CONCIV_API_BASE__ ??
    (metaContent('pw-api-base') || new URLSearchParams(window.location.search).get('core')) ??
    ''
  )
}
