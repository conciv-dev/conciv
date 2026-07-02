import Magnet from '@/components/Magnet'
import {CopyButton} from './copy-button'

const COMMAND = 'npm i -D @conciv/it'

export function InstallChip() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="inline-flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[13px]">
        <span className="text-primary">$</span>
        <span>{COMMAND}</span>
        <span className="ml-1">
          <CopyButton.Root text={COMMAND}>
            <CopyButton.Trigger label="Copy install command" />
            <CopyButton.Feedback />
          </CopyButton.Root>
        </span>
      </div>
      <Magnet padding={44} magnetStrength={3}>
        <a href="/docs/quick-start" className="text-[13.5px] font-semibold text-primary hover:underline">
          Quick start →
        </a>
      </Magnet>
    </div>
  )
}
