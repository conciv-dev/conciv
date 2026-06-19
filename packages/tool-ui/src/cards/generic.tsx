import {Show, type JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {ToolCard} from '../shell.js'
import {resultText} from '../util.js'
import type {ToolCardProps} from '../types.js'

// Raw args: the parsed input when present, else the (possibly partial) JSON argument string.
function rawArgs(props: ToolCardProps): string {
  if (props.part.input !== undefined) return JSON.stringify(props.part.input, null, 2)
  try {
    return JSON.stringify(JSON.parse(props.part.arguments), null, 2)
  } catch {
    return props.part.arguments
  }
}

function GenericIcon(): JSX.Element {
  return <Wrench size={14} />
}

// Raw args / result <pre> inside the collapsible details (also reused for the result block).
const RAW_PRE =
  'mt-1.25 font-pw-mono text-[0.6875rem] text-pw-text-2 bg-pw-sunken rounded-pw-sm py-1.75 px-2.25 overflow-x-auto'

// Fallback card for any tool name with no dedicated card (tanstack convention: render by name,
// generic for the rest). Title is the raw tool name; body shows raw args + result behind a details.
export function GenericCard(props: ToolCardProps): JSX.Element {
  return (
    <ToolCard
      accent="neutral"
      Icon={GenericIcon}
      title={props.part.name}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <Show
        when={props.result?.state === 'error'}
        fallback={
          <details>
            <summary class="text-[0.6875rem] text-pw-text-3 cursor-pointer focus-ring">details</summary>
            <pre class={RAW_PRE}>{rawArgs(props)}</pre>
            <Show when={resultText(props.result)}>
              <pre class={RAW_PRE}>{resultText(props.result)}</pre>
            </Show>
          </details>
        }
      >
        <div class="text-[0.75rem] text-pw-danger font-pw-mono whitespace-pre-wrap">
          {props.result?.error ?? resultText(props.result)}
        </div>
      </Show>
    </ToolCard>
  )
}
