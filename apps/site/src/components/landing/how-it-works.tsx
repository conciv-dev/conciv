import {useRef} from 'react'
import VariableProximity from '@/components/VariableProximity'
import {RobotFab} from './robot-fab'
import {ConcivMark} from '@internal/brand-react'
import {InstallStep, InstallSteps} from './install-steps'

export function HowItWorks() {
  const railRef = useRef<HTMLDivElement>(null)

  return (
    <section id="how" className="mx-auto max-w-[1180px] px-8 pb-24 pt-16">
      <div className="grid items-start gap-16 md:grid-cols-[0.9fr_1.1fr]">
        <div ref={railRef} className="min-w-0 md:sticky md:top-12">
          <p className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            How it works
          </p>
          <h2 className="od-display mb-2 text-[clamp(28px,3.4vw,40px)] font-bold tracking-[-0.025em] [text-wrap:balance]">
            <VariableProximity
              label="From npm to"
              containerRef={railRef}
              fromFontVariationSettings="'wght' 700, 'opsz' 40"
              toFontVariationSettings="'wght' 800, 'opsz' 96"
              radius={72}
              falloff="exponential"
            />{' '}
            <ConcivMark className="inline-block size-[0.95em] translate-y-[0.12em]" />{' '}
            <VariableProximity
              label="in three steps"
              containerRef={railRef}
              fromFontVariationSettings="'wght' 700, 'opsz' 40"
              toFontVariationSettings="'wght' 800, 'opsz' 96"
              radius={72}
              falloff="exponential"
            />
          </h2>
          <p className="max-w-[52ch] text-muted-foreground">
            No SaaS, no keys to paste, no second terminal. The agent you already trust, mounted in your dev build.
          </p>
        </div>
        <div className="min-w-0">
          <InstallSteps />
          <InstallStep
            number="3"
            title="Meet the robot"
            body="Start your dev server. The mascot appears in the corner when the engine is live. Click it and start talking to your app."
          >
            <RobotFab />
          </InstallStep>
        </div>
      </div>
    </section>
  )
}
