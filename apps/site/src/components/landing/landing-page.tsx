import {SiteNav} from './site-nav'
import {HeroCopy} from './hero'
import {ProductFrame} from './product-frame'
import {LandingMotion} from './lazy-motion'
import {BundlerBand} from './bundler-band'
import {FeaturesSection} from './features-section'
import {HowItWorks} from './how-it-works'
import {SiteFooter} from './site-footer'
import {Reveal} from './reveal'

export function LandingPage() {
  return (
    <LandingMotion>
      <div className="min-h-screen">
        <SiteNav />
        <main className="od-container">
          <Reveal>
            <HeroCopy />
          </Reveal>
          <ProductFrame />
          <div className="od-rule" />
          <BundlerBand />
          <div className="od-rule" />
          <FeaturesSection />
          <div className="od-rule" />
          <Reveal>
            <HowItWorks />
          </Reveal>
        </main>
        <SiteFooter />
      </div>
    </LandingMotion>
  )
}
