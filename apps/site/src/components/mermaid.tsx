'use client'

import {Suspense, lazy, useCallback, useState} from 'react'
import {ClientOnly} from '@tanstack/react-router'

const MermaidContent = lazy(() => import('./mermaid-content').then((module) => ({default: module.MermaidContent})))

function DiagramSkeleton({height}: {height: number}) {
  return (
    <div
      aria-hidden="true"
      className="not-prose my-6 flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed bg-fd-muted/30 motion-safe:animate-pulse"
      style={{height}}
    >
      <div className="h-10 w-48 rounded-lg bg-fd-muted" />
      <div className="h-12 w-px bg-fd-border" />
      <div className="flex gap-6">
        <div className="h-10 w-36 rounded-lg bg-fd-muted" />
        <div className="h-10 w-36 rounded-lg bg-fd-muted" />
      </div>
    </div>
  )
}

export function Mermaid({chart, height = 320}: {chart: string; height?: number}) {
  const [near, setNear] = useState(false)
  const watch = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null || near) return
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) setNear(true)
        },
        {rootMargin: '600px 0px'},
      )
      observer.observe(element)
      return () => observer.disconnect()
    },
    [near],
  )
  const skeleton = <DiagramSkeleton height={height} />

  return (
    <div ref={watch} role="figure" aria-label="Diagram" style={{minHeight: height}}>
      {near ? (
        <ClientOnly fallback={skeleton}>
          <Suspense fallback={skeleton}>
            <MermaidContent chart={chart} />
          </Suspense>
        </ClientOnly>
      ) : (
        skeleton
      )}
    </div>
  )
}
