import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// claude Read carries file_path + optional offset/limit; aidx_open carries file + optional line.
const ReadInput = z.object({
  file_path: z.string().optional(),
  file: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  line: z.number().optional(),
})

function FileReadIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-read" aria-hidden="true">
      ▤
    </span>
  )
}

function lineRange(input: z.infer<typeof ReadInput>): string | undefined {
  if (input.line !== undefined) return `:${input.line}`
  if (input.offset !== undefined) {
    const end = input.limit !== undefined ? input.offset + input.limit : undefined
    return end !== undefined ? `:${input.offset}-${end}` : `:${input.offset}`
  }
  return undefined
}

export function FileReadCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(ReadInput, props.part)
  const path = () => input()?.file_path ?? input()?.file ?? ''
  const verb = () => (props.part.name === 'aidx_open' ? 'Opened' : 'Read')
  const range = () => {
    const i = input()
    return i ? lineRange(i) : undefined
  }
  return (
    <ToolCard
      accent="read"
      Icon={FileReadIcon}
      title={path() ? `${verb()} ${path()}` : `${verb()} a file`}
      part={props.part}
      result={props.result}
      meta={range()}
    >
      <Show when={path()}>
        <code class="pw-path">
          {path()}
          {range()}
        </code>
      </Show>
    </ToolCard>
  )
}
