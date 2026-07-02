import {SiteNav} from './site-nav'
import {Hero} from './hero'
import {LandingMotion} from './lazy-motion'
import {BundlerBand} from './bundler-band'
import {FeaturesSection} from './features-section'
import {HowItWorks} from './how-it-works'

export function LandingPage() {
  return (
    <LandingMotion>
      <div className="od-page min-h-screen">
        <SiteNav />
        <Hero />
        <BundlerBand />
        <FeaturesSection />
        <HowItWorks />
      </div>
    </LandingMotion>
  )
}
