import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {FileText} from 'lucide-solid'
import {SolidCodeBlock} from '@opendui/aidx-solid-diffs'
import {ToolCard} from '../shell.js'
import {parseInput, resultText, stripReadLineNumbers} from '../util.js'
import {CODE_OPTIONS} from '../diff-options.js'
import type {ToolCardProps} from '../types.js'

// claude Read carries file_path + optional offset/limit; aidx_open carries file + optional line.
const ReadInput = z.object({
  file_path: z.string().optional(),
  file: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  line: z.number().optional(),
})

const MAX_LINES = 200 // cap so a huge file can't blow the thread

function FileReadIcon(): JSX.Element {
  return <FileText size={14} />
}

function lineRange(input: z.infer<typeof ReadInput>): string | undefined {
  if (input.line !== undefined) return `:${input.line}`
  if (input.offset !== undefined) {
    const end = input.limit !== undefined ? input.offset + input.limit : undefined
    return end !== undefined ? `:${input.offset}-${end}` : `:${input.offset}`
  }
  return undefined
}

// Strip claude Read's "<lineno>\t" prefix (so it isn't a duplicate gutter) and cap the line count so
// a huge file can't blow the thread.
function fileContents(raw: string): string {
  if (!raw) return ''
  const lines = stripReadLineNumbers(raw).split('\n')
  const capped = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines
  return capped.join('\n')
}

export function FileReadCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(ReadInput, props.part)
  const path = () => input()?.file_path ?? input()?.file ?? ''
  const verb = () => (props.part.name === 'aidx_open' ? 'Opened' : 'Read')
  const range = () => {
    const i = input()
    return i ? lineRange(i) : undefined
  }
  // aidx_open just opens the editor (no contents); Read returns the file text.
  const contents = () => (props.part.name === 'aidx_open' ? '' : fileContents(resultText(props.result)))
  return (
    <ToolCard
      accent="read"
      Icon={FileReadIcon}
      title={path() ? `${verb()} ${path()}` : `${verb()} a file`}
      part={props.part}
      result={props.result}
      meta={range()}
    >
      <Show
        when={contents()}
        fallback={
          <Show when={path()}>
            {
              <code class="pw-path">
                {path()}
                {range()}
              </code>
            }
          </Show>
        }
      >
        <SolidCodeBlock
          class="pw-read-code"
          options={CODE_OPTIONS}
          file={{name: path() || 'file', contents: contents()}}
        />
      </Show>
    </ToolCard>
  )
}
