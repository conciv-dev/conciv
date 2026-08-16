/// <reference lib="dom" />

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

async function startWidget(): Promise<void> {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  const [{entries}, {mountConciv}, {dedupeExtensions}] = await Promise.all([
    import('@conciv/app-extensions'),
    import('@conciv/embed'),
    import('@conciv/extension-compiler/dedupe'),
  ])
  const picked = dedupeExtensions(entries)
  for (const drop of picked.dropped) console.warn('conciv extension dropped:', drop.source, drop.reason)
  await mountConciv(picked.extensions)
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => startWidget().catch((error) => console.error('[conciv] widget failed to start', error)),
      {once: true},
    )
  } else {
    startWidget().catch((error) => console.error('[conciv] widget failed to start', error))
  }
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export {}
