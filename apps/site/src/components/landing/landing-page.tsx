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
  return (
    <div className="relative isolate min-h-dvh">
      <PaperGrain />
      <SiteNav />
      <main>
        <HeroCopy />
        <ProductFrame />
        <PrinciplesStrip />
        <LandingSpacer />
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
