import {SiteNav} from './site-nav'
import {Hero} from './hero'
import {LandingMotion} from './lazy-motion'
import {BundlerBand} from './bundler-band'
import {FeaturesSection} from './features-section'
import {HowItWorks} from './how-it-works'
import {SiteFooter} from './site-footer'

export function LandingPage() {
  return (
    <LandingMotion>
      <div className="od-page min-h-screen">
        <SiteNav />
        <Hero />
        <BundlerBand />
        <FeaturesSection />
        <HowItWorks />
        <SiteFooter />
      </div>
    </LandingMotion>
  )
}
