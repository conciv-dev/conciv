import {useId} from 'react'
import {useSuspenseQuery} from '@tanstack/react-query'
import {useTheme} from 'next-themes'

const KEPT = {staleTime: Infinity, gcTime: Infinity, structuralSharing: false} as const

export function MermaidContent({chart}: {chart: string}) {
  const id = useId()
  const {resolvedTheme} = useTheme()
  const {
    data: {default: mermaid},
  } = useSuspenseQuery({queryKey: ['mermaid'], queryFn: () => import('mermaid'), ...KEPT})

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  })

  const {
    data: {svg, bindFunctions},
  } = useSuspenseQuery({
    queryKey: ['mermaid-render', chart, resolvedTheme],
    queryFn: () => mermaid.render(id, chart.replaceAll('\\n', '\n')),
    ...KEPT,
  })

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container)
      }}
      dangerouslySetInnerHTML={{__html: svg}}
    />
  )
}
