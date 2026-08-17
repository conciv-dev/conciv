import {SiteNav} from './site-nav'
import {HeroCopy} from './hero'
import {ProductFrame} from './product-frame'
import {PrinciplesStrip} from './principles-strip'
import {CapabilitySection} from './capability-section'
import {HowItWorks} from './how-it-works'
import {OpenSourceStrip} from './open-source-strip'
import {SiteFooter} from './site-footer'
import {LandingSpacer} from './landing-spacer'

export function LandingPage() {
  return (
    <div className="min-h-dvh">
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
