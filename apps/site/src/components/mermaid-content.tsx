import {useId, useSyncExternalStore} from 'react'
import {useSuspenseQuery} from '@tanstack/react-query'

const KEPT = {staleTime: Infinity, gcTime: Infinity, structuralSharing: false} as const

const SKETCH = {look: 'handDrawn', font: 'Excalifont', size: 16} as const

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

function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {attributeFilter: ['class']})
  return () => observer.disconnect()
}

function readTheme(): 'dark' | 'light' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function readConfig() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', {willReadFrequently: true})
  if (!context) return {}
  const background = readToken(context, 'background')
  const border = readToken(context, 'border')
  const foreground = readToken(context, 'foreground')
  const muted = readToken(context, 'muted-foreground')
  const primary = readToken(context, 'primary')
  const node = mix(primary, background, 0.14)
  const outline = mix(primary, background, 0.5)
  const line = mix(primary, muted, 0.55)
  return {
    theme: 'base',
    look: SKETCH.look,
    handDrawnSeed: 1,
    fontFamily: SKETCH.font,
    fontSize: SKETCH.size,
    flowchart: {nodeSpacing: 40, rankSpacing: 48, padding: 14, curve: 'basis', wrappingWidth: 160, useMaxWidth: false},
    themeVariables: {
      background: rgb(background),
      fontSize: `${SKETCH.size}px`,
      primaryColor: rgb(node),
      mainBkg: rgb(node),
      primaryBorderColor: rgb(outline),
      nodeBorder: rgb(outline),
      primaryTextColor: rgb(foreground),
      nodeTextColor: rgb(foreground),
      textColor: rgb(muted),
      titleColor: rgb(muted),
      lineColor: rgb(line),
      clusterBkg: rgb(mix(muted, background, 0.04)),
      clusterBorder: rgb(border),
      edgeLabelBackground: rgb(background),
    },
    themeCSS: [
      'margin: 0 auto;',
      '.node rect, .node polygon { rx: 10px; ry: 10px; filter: none; }',
      '.cluster rect { rx: 14px; ry: 14px; }',
      '.nodeLabel, .edgeLabel, .cluster-label { line-height: 1.35; }',
      `.cluster-label .nodeLabel, .edgeLabel, .edgeLabel p { font-size: ${SKETCH.size - 2}px; }`,
      '.marker path { transform-box: fill-box; transform-origin: center; transform: scale(0.7); }',
    ].join(' '),
  }
}

function parseSvg(svg: string): Node[] {
  const parsed = new DOMParser().parseFromString(svg, 'text/html').body
  return Array.from(parsed.childNodes, (node) => document.importNode(node, true))
}

export function MermaidContent({chart}: {chart: string}) {
  const id = useId()
  const theme = useSyncExternalStore(watchTheme, readTheme)
  const {
    data: {default: mermaid},
  } = useSuspenseQuery({queryKey: ['mermaid'], queryFn: () => import('mermaid'), ...KEPT})

  mermaid.initialize({startOnLoad: false, securityLevel: 'loose'})

  const {
    data: {svg, bindFunctions},
  } = useSuspenseQuery({
    queryKey: ['mermaid-render', chart, theme],
    queryFn: async () => {
      await document.fonts.load(`${SKETCH.size}px "${SKETCH.font}"`)
      return mermaid.render(id, `%%{init: ${JSON.stringify(readConfig())}}%%\n${chart.replaceAll('\\n', '\n')}`)
    },
    ...KEPT,
  })

  return (
    <div
      className="not-prose my-6 overflow-x-auto [&>svg]:mx-auto [&>svg]:block xl:docs-breakout"
      ref={(container) => {
        if (!container) return
        container.replaceChildren(...parseSvg(svg))
        bindFunctions?.(container)
      }}
    />
  )
}
