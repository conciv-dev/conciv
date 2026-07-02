import ClickSpark from '@/components/ClickSpark'
import {SiteNav} from './site-nav'
import {Hero} from './hero'
import {LandingMotion} from './lazy-motion'
import {BundlerBand} from './bundler-band'
import {FeaturesSection} from './features-section'
import {HowItWorks} from './how-it-works'
import {SiteFooter} from './site-footer'
import {SmoothScroll} from './smooth-scroll'

export function LandingPage() {
  return (
    <LandingMotion>
      <SmoothScroll>
        <ClickSpark sparkColor="var(--od-accent)" sparkRadius={18} sparkCount={6} duration={420}>
          <div className="od-page min-h-screen">
            <SiteNav />
            <Hero />
            <BundlerBand />
            <FeaturesSection />
            <HowItWorks />
            <SiteFooter />
          </div>
        </ClickSpark>
      </SmoothScroll>
    </LandingMotion>
  )
}
