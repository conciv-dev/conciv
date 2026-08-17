import {ClientOnly} from '@tanstack/react-router'
import {HeroGrid, type HeroGridProps} from './hero-grid'

export function HeroBackdrop(props: HeroGridProps) {
  return (
    <div aria-hidden className="od-hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <div className="od-hero-wash" />
      <ClientOnly>
        <HeroGrid {...props} />
      </ClientOnly>
    </div>
  )
}
