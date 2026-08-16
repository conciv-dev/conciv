import {SiteNav} from './site-nav'
import {HeroCopy} from './hero'
import {ProductFrame} from './product-frame'
import {LandingMotion} from './lazy-motion'
import {PrinciplesStrip} from './principles-strip'
import {CapabilitySection} from './capability-section'
import {HowItWorks} from './how-it-works'
import {OpenSourceStrip} from './open-source-strip'
import {SiteFooter} from './site-footer'

export function LandingPage() {
  return (
    <LandingMotion>
      <div className="min-h-dvh">
        <SiteNav />
        <main>
          <HeroCopy />
          <ProductFrame />
          <PrinciplesStrip />
          <CapabilitySection />
          <HowItWorks />
          <OpenSourceStrip />
        </main>
        <SiteFooter />
      </div>
    </LandingMotion>
  )
}
