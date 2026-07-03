import {useRef, type ReactNode} from 'react'
import AnimatedContent from '@/components/AnimatedContent'
import VariableProximity from '@/components/VariableProximity'
import {RobotFab} from './robot-fab'
import {SparkMark} from './spark-mark'
import {FrameworkTabs} from './framework-tabs'
import {FRAMEWORK_SNIPPETS} from './framework-snippets'

function Code({children}: {children: ReactNode}) {
  return (
    <pre className="overflow-x-auto rounded-[10px] border bg-card px-4 py-3 font-mono text-[12.5px] leading-[1.7]">
      {children}
    </pre>
  )
}

function Step({number, title, body, children}: {number: string; title: string; body: string; children?: ReactNode}) {
  return (
    <AnimatedContent
      distance={36}
      duration={0.65}
      ease="power3.out"
      threshold={0.2}
      className="grid grid-cols-[88px_1fr] gap-6 border-t py-[30px] last:border-b"
    >
      <div
        aria-hidden
        className="od-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.04em] text-accent [-webkit-text-stroke:1.5px_var(--od-accent)]"
      >
        {number}
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mb-3 max-w-[46ch] text-[13.5px] text-muted-foreground">{body}</p>
        {children}
      </div>
    </AnimatedContent>
  )
}

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
            <SparkMark className="text-primary" />
            <span className="sr-only">conciv</span>{' '}
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
          <Step number="1" title="Install" body="One dev dependency. Nothing ships to production.">
            <Code>
              <span className="text-primary">$</span> npm i -D @conciv/it
            </Code>
          </Step>
          <Step number="2" title="Add the plugin" body="Pick your build. Every entry is one import.">
            <FrameworkTabs.Root snippets={FRAMEWORK_SNIPPETS}>
              <FrameworkTabs.List />
              <FrameworkTabs.Panel>
                <FrameworkTabs.FileBar />
                <FrameworkTabs.Code />
                <FrameworkTabs.Note />
              </FrameworkTabs.Panel>
            </FrameworkTabs.Root>
          </Step>
          <Step
            number="3"
            title="Meet the robot"
            body="Start your dev server. The mascot appears in the corner when the engine is live — click it and start talking to your app."
          >
            <RobotFab />
          </Step>
        </div>
      </div>
    </section>
  )
}
