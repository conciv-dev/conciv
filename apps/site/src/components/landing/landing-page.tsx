import {SiteNav} from './site-nav'
import {Hero} from './hero'
import {LandingMotion} from './lazy-motion'
import {BundlerBand} from './bundler-band'

export function LandingPage() {
  return (
    <LandingMotion>
      <div className="od-page min-h-screen">
        <SiteNav />
        <Hero />
        <BundlerBand />
      </div>
    </LandingMotion>
  )
}
