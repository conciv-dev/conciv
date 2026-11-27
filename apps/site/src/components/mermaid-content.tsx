import {useId} from 'react'
import {useSuspenseQuery} from '@tanstack/react-query'
import {useTheme} from 'next-themes'

const KEPT = {staleTime: Infinity, gcTime: Infinity, structuralSharing: false} as const

export type MermaidLook = 'outline' | 'soft'

type Rgb = readonly [number, number, number]

function readToken(context: CanvasRenderingContext2D, name: string): Rgb {
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--color-fd-${name}`).trim()
  context.fillRect(0, 0, 1, 1)
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
  return [red, green, blue]
}

function mix(color: Rgb, base: Rgb, amount: number): Rgb {
  const blend = (index: 0 | 1 | 2) => Math.round(color[index] * amount + base[index] * (1 - amount))
  return [blend(0), blend(1), blend(2)]
}

function rgb(color: Rgb): string {
  return `rgb(${color.join(', ')})`
}

function readTheme(look: MermaidLook) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', {willReadFrequently: true})
  if (!context) return {}
  const background = readToken(context, 'background')
  const card = readToken(context, 'card')
  const border = readToken(context, 'border')
  const foreground = readToken(context, 'foreground')
  const muted = readToken(context, 'muted-foreground')
  const primary = readToken(context, 'primary')
  const node = look === 'outline' ? card : mix(primary, background, 0.14)
  const outline = look === 'outline' ? border : mix(primary, background, 0.35)
  const line = look === 'outline' ? muted : mix(primary, muted, 0.55)
  return {
    theme: 'base',
    themeVariables: {
      background: rgb(background),
      fontSize: '14px',
      primaryColor: rgb(node),
      mainBkg: rgb(node),
      primaryBorderColor: rgb(outline),
      nodeBorder: rgb(outline),
      primaryTextColor: rgb(foreground),
      nodeTextColor: rgb(foreground),
      textColor: rgb(muted),
      titleColor: rgb(muted),
      lineColor: rgb(line),
      clusterBkg: rgb(look === 'outline' ? background : mix(muted, background, 0.04)),
      clusterBorder: rgb(border),
      edgeLabelBackground: rgb(background),
    },
    themeCSS: [
      'margin: 1.5rem auto 0;',
      '.node rect, .node polygon { rx: 8px; ry: 8px; stroke-width: 1px; filter: none; }',
      `.cluster rect { rx: 12px; ry: 12px; stroke-width: 1px; ${look === 'outline' ? 'stroke-dasharray: 4 4;' : ''} }`,
      '.flowchart-link { stroke-width: 1px; }',
      '.cluster-label .nodeLabel, .cluster-label span { font-size: 13px; }',
      '.edgeLabel, .edgeLabel p { font-size: 12px; }',
    ].join(' '),
  }
}

export function MermaidContent({chart, look = 'outline'}: {chart: string; look?: MermaidLook}) {
  const id = useId()
  const {resolvedTheme} = useTheme()
  const {
    data: {default: mermaid},
  } = useSuspenseQuery({queryKey: ['mermaid'], queryFn: () => import('mermaid'), ...KEPT})

  mermaid.initialize({startOnLoad: false, securityLevel: 'loose', fontFamily: 'inherit'})

  const {
    data: {svg, bindFunctions},
  } = useSuspenseQuery({
    queryKey: ['mermaid-render', chart, resolvedTheme, look],
    queryFn: () =>
      mermaid.render(id, `%%{init: ${JSON.stringify(readTheme(look))}}%%\n${chart.replaceAll('\\n', '\n')}`),
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
