import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ToolCard} from '../shell.js'
import {parseInput, resultText} from '../util.js'
import type {ToolCardProps} from '../types.js'

// The shell-command tool input we read for rendering (claude's Bash and equivalents).
const ShellInput = z.object({command: z.string().optional(), description: z.string().optional()})

const MAX_LINES = 40 // vertical cap; longer output collapses behind "show more"

function ShellIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-term" aria-hidden="true">
      $
    </span>
  )
}

export function ShellCard(props: ToolCardProps): JSX.Element {
  const command = () => parseInput(ShellInput, props.part)?.command ?? ''
  const out = () => resultText(props.result)
  const lines = () => out().split('\n')
  const extra = () => lines().length - MAX_LINES
  return (
    <ToolCard
      accent="code"
      Icon={ShellIcon}
      title={command() ? `Ran ${command()}` : 'Ran a command'}
      part={props.part}
      result={props.result}
    >
      <div class="pw-term" classList={{'pw-tool-errbox': props.result?.state === 'error'}}>
        <Show when={command()}>
          <div class="pw-term-cmd">{command()}</div>
        </Show>
        <Show when={out()}>
          <pre class="pw-term-out">{extra() > 0 ? lines().slice(0, MAX_LINES).join('\n') : out()}</pre>
          <Show when={extra() > 0}>
            <details class="pw-tool-more">
              <summary>show {extra()} more lines</summary>
              <pre>{lines().slice(MAX_LINES).join('\n')}</pre>
            </details>
          </Show>
        </Show>
      </div>
    </ToolCard>
  )
}
