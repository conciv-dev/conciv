'use client'

import {Suspense, lazy} from 'react'
import {ClientOnly} from '@tanstack/react-router'
import type {MermaidLook} from './mermaid-content'

const MermaidContent = lazy(() => import('./mermaid-content').then((module) => ({default: module.MermaidContent})))

export function Mermaid({chart, look}: {chart: string; look?: MermaidLook}) {
  return (
    <ClientOnly>
      <Suspense>
        <MermaidContent chart={chart} look={look} />
      </Suspense>
    </ClientOnly>
  )
}
