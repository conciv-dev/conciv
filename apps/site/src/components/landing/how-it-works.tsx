import type {ReactNode} from 'react'
import screenshots from '../../data/screenshots-index.json'
import {InstallCommand} from './install-command'
import {FrameworkTabs} from './framework-tabs'
import {FRAMEWORK_SNIPPETS} from './framework-snippets'
import {CopyButton} from './copy-button'

type ScreenshotEntry = (typeof screenshots)[number]

function findScreenshot(file: string): ScreenshotEntry {
  const entry = screenshots.find((item) => item.file === file)
  if (!entry) throw new Error(`Missing screenshot manifest entry for ${file}`)
  return entry
}

const PNPM_DEV_COMMAND = 'pnpm dev'

function TerminalBlock({command}: {command: string}) {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-[10px] border bg-card">
      <div className="flex items-center justify-between border-b px-3.5 py-2">
        <span className="od-mono text-[11px] text-muted-foreground">terminal</span>
        <CopyButton.Root text={command}>
          <CopyButton.Trigger label="Copy command" />
          <CopyButton.Feedback />
        </CopyButton.Root>
      </div>
      <pre className="od-mono overflow-x-auto px-3.5 py-3 text-[12.5px] leading-[1.7]">
        <span className="text-primary">$</span> {command}
      </pre>
    </div>
  )
}

function StepRow({number, title, body, children}: {number: string; title: string; body: string; children: ReactNode}) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t py-10 sm:grid-cols-[56px_1fr] sm:gap-6">
      <div className="od-mono text-[56px] leading-none text-primary">{number}</div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mb-4 max-w-[52ch] text-[13.5px] text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  )
}

export function HowItWorks() {
  const fabClosed = findScreenshot('fab-closed.webp')

  return (
    <section id="how" className="px-8 py-16">
      <p className="od-eyebrow mb-3">How it works</p>
      <h2 className="od-h2 mb-2">From npm to the spark in three steps.</h2>
      <p className="max-w-[52ch] text-muted-foreground">No SaaS, no second terminal.</p>
      <div className="mt-6">
        <StepRow number="01" title="Install" body="One dev dependency. Nothing ships to production.">
          <InstallCommand />
        </StepRow>
        <StepRow number="02" title="Add the integration" body="Pick your build. Every entry is one import.">
          <FrameworkTabs.Root snippets={FRAMEWORK_SNIPPETS}>
            <FrameworkTabs.List />
            <FrameworkTabs.Panel>
              <FrameworkTabs.FileBar />
              <FrameworkTabs.Code />
              <FrameworkTabs.Note />
            </FrameworkTabs.Panel>
          </FrameworkTabs.Root>
        </StepRow>
        <StepRow
          number="03"
          title="Open your app"
          body="The spark appears bottom-right. Click it, or press Mod+` for the quick terminal."
        >
          <div className="flex flex-wrap items-center gap-6">
            <TerminalBlock command={PNPM_DEV_COMMAND} />
            <figure className="w-[120px]">
              <img
                src={`/screenshots/${fabClosed.file}`}
                width={fabClosed.width}
                height={fabClosed.height}
                alt={fabClosed.alt}
                loading="lazy"
                decoding="async"
                className="od-screenshot w-full"
              />
            </figure>
          </div>
        </StepRow>
      </div>
    </section>
  )
}
