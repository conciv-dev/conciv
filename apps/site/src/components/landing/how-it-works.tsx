import type {ReactNode} from 'react'
import {findScreenshot} from '@/lib/screenshots'
import {CodeBlock} from '@/components/ui/code-block'
import {MediaFrame} from '@/components/ui/media-frame'
import {InstallCommand} from './install-command'
import {FrameworkTabs} from './framework-tabs'
import {FRAMEWORK_SNIPPETS} from './framework-snippets'

const DEV_COMMAND = 'pnpm dev'

function StepRow({number, title, body, children}: {number: string; title: string; body: string; children: ReactNode}) {
  return (
    <li className="od-inset grid grid-cols-1 gap-4 border-t py-12 md:grid-cols-[96px_minmax(0,1fr)] md:gap-8">
      <span className="od-mono text-[26px] leading-8 tabular-nums text-primary">{number}</span>
      <div className="min-w-0">
        <h3 className="od-h3">{title}</h3>
        <p className="od-body mt-2 max-w-[512px] text-muted-foreground">{body}</p>
        <div className="mt-6">{children}</div>
      </div>
    </li>
  )
}

export function HowItWorks() {
  const fabClosed = findScreenshot('fab-closed.webp')

  return (
    <section id="how" className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <div className="od-inset py-16">
            <h2 className="od-h2">Three steps from install to first edit.</h2>
            <p className="od-body mt-2 text-muted-foreground">No SaaS, no second terminal.</p>
          </div>
          <ol>
            <StepRow number="01" title="Install" body="One dev dependency. Nothing ships to production.">
              <InstallCommand />
            </StepRow>
            <StepRow number="02" title="Add the integration" body="Pick your build. Every entry is one import.">
              <FrameworkTabs snippets={FRAMEWORK_SNIPPETS} />
            </StepRow>
            <StepRow
              number="03"
              title="Open your app"
              body="The spark appears bottom-right. Click it, or press Mod+` for the quick terminal."
            >
              <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <CodeBlock filename="terminal" copyText={DEV_COMMAND} copyLabel="Copy command" className="h-full">
                  <pre className="od-mono overflow-x-auto px-4 py-3 text-[13px] leading-6">
                    <span className="text-primary">$</span> {DEV_COMMAND}
                  </pre>
                </CodeBlock>
                <figure className="h-full">
                  <MediaFrame
                    src={`/screenshots/${fabClosed.file}`}
                    width={fabClosed.width}
                    height={fabClosed.height}
                    alt={fabClosed.alt}
                    title="The spark"
                    fill
                  />
                </figure>
              </div>
            </StepRow>
          </ol>
        </div>
      </div>
    </section>
  )
}
