import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Terminal} from 'lucide-solid'
import {ToolCard} from '../shell.js'
import {parseInput, resultText} from '../util.js'
import {VirtualLines} from '../virtual-lines.js'
import type {ToolCardProps} from '../types.js'

// The shell-command tool input we read for rendering (claude's Bash and equivalents).
const ShellInput = z.object({command: z.string().optional(), description: z.string().optional()})

function ShellIcon(): JSX.Element {
  return <Terminal size={14} />
}

export function ShellCard(props: ToolCardProps): JSX.Element {
  const command = () => parseInput(ShellInput, props.part)?.command ?? ''
  const out = () => resultText(props.result)
  const lines = () => out().split('\n')
  return (
    <ToolCard
      accent="code"
      Icon={ShellIcon}
      title={command() ? `Ran ${command()}` : 'Ran a command'}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div
        class={`text-[0.75rem] font-pw-mono px-2.25 py-1.75 rounded-pw-sm bg-pw-sunken overflow-x-auto${
          props.result?.state === 'error' ? ' border border-pw-danger-line' : ''
        }`}
      >
        <Show when={command()}>
          <div class="text-pw-accent-link whitespace-pre before:text-pw-text-3 before:content-['$_']">{command()}</div>
        </Show>
        <Show when={out()}>
          {/* Long output stays a fixed, sane height and virtual-scrolls — never a giant dump. */}
          <VirtualLines class="text-pw-text-2 mt-1.25 whitespace-pre" lines={lines()} />
        </Show>
      </div>
    </ToolCard>
  )
}
