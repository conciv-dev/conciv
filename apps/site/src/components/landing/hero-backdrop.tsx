import {ClientOnly} from '@tanstack/react-router'
import {Suspense, lazy} from 'react'
import type {HeroShaderVariant} from './hero-shader-sources'

const HeroShader = lazy(() => import('./hero-shader').then((module) => ({default: module.HeroShader})))

const HERO_SHADER_VARIANT: HeroShaderVariant = 'morph'

export function HeroBackdrop() {
  return (
    <div aria-hidden className="od-hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <ClientOnly>
        <Suspense fallback={null}>
          <HeroShader variant={HERO_SHADER_VARIANT} />
        </Suspense>
      </ClientOnly>
    </div>
  )
}
