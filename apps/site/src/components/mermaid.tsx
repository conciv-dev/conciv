'use client'

import {Suspense, lazy} from 'react'
import {ClientOnly} from '@tanstack/react-router'

const MermaidContent = lazy(() => import('./mermaid-content').then((module) => ({default: module.MermaidContent})))

export function Mermaid({chart}: {chart: string}) {
  return (
    <ClientOnly>
      <Suspense>
        <MermaidContent chart={chart} />
      </Suspense>
    </ClientOnly>
  )
}
