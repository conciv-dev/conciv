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

// Fallback card for any tool name with no dedicated card (tanstack convention: render by name,
// generic for the rest). Title is the raw tool name; body shows raw args + result behind a details.
export function GenericCard(props: ToolCardProps): JSX.Element {
  return (
    <ToolCard accent="neutral" Icon={GenericIcon} title={props.part.name} part={props.part} result={props.result}>
      <Show
        when={props.result?.state === 'error'}
        fallback={
          <details class="pw-tool-raw">
            <summary>details</summary>
            <pre>{rawArgs(props)}</pre>
            <Show when={resultText(props.result)}>
              <pre>{resultText(props.result)}</pre>
            </Show>
          </details>
        }
      >
        <div class="pw-tool-error">{props.result?.error ?? resultText(props.result)}</div>
      </Show>
    </ToolCard>
  )
}
