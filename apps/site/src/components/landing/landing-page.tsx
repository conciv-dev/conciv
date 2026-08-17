import {useRef} from 'react'
import {SiteNav} from './site-nav'
import {HeroCopy} from './hero'
import {ProductFrame} from './product-frame'
import {PrinciplesStrip} from './principles-strip'
import {CapabilitySection} from './capability-section'
import {HowItWorks} from './how-it-works'
import {OpenSourceStrip} from './open-source-strip'
import {SiteFooter} from './site-footer'
import {LandingSpacer} from './landing-spacer'
import {PaperGrain} from './paper-grain'

export function LandingPage() {
  const grainStop = useRef<HTMLDivElement>(null)

  return (
    <div className="relative isolate min-h-dvh">
      <PaperGrain stopAt={grainStop} />
      <SiteNav />
      <main>
        <HeroCopy />
        <ProductFrame />
        <PrinciplesStrip />
        <LandingSpacer ref={grainStop} />
        <CapabilitySection />
        <LandingSpacer />
        <HowItWorks />
        <LandingSpacer />
        <OpenSourceStrip />
      </main>
      <SiteFooter />
    </div>
  )
}
