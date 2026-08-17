import {ClientOnly} from '@tanstack/react-router'
import {HeroEngraving} from './hero-engraving'
import type {HeroEngravingVariant} from './hero-engraving-figures'

const HERO_ENGRAVING_VARIANT: HeroEngravingVariant = 'rings'

export function HeroBackdrop() {
  return (
    <div aria-hidden className="od-hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <ClientOnly>
        <HeroEngraving variant={HERO_ENGRAVING_VARIANT} />
      </ClientOnly>
    </div>
  )
}
