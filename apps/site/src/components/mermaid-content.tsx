import {use, useId} from 'react'
import {useTheme} from 'next-themes'
import type {RenderResult} from 'mermaid'

function promiseCache<T>(): (key: string, setPromise: () => Promise<T>) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key, setPromise) => {
    const cached = cache.get(key)
    if (cached) return cached

    const promise = setPromise()
    cache.set(key, promise)
    return promise
  }
}

const cachedModule = promiseCache<typeof import('mermaid')>()

const cachedRender = promiseCache<RenderResult>()

export function MermaidContent({chart}: {chart: string}) {
  const id = useId()
  const {resolvedTheme} = useTheme()
  const {default: mermaid} = use(cachedModule('mermaid', () => import('mermaid')))

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  })

  const {svg, bindFunctions} = use(
    cachedRender(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll('\\n', '\n'))
    }),
  )

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container)
      }}
      dangerouslySetInnerHTML={{__html: svg}}
    />
  )
}
