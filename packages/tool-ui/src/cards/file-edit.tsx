import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {FilePen} from 'lucide-solid'
import {SolidFileDiff} from '@mandarax/solid-diffs'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import {DIFF_OPTIONS} from '../diff-options.js'
import type {ToolCardEntry, ToolCardProps} from '../types.js'

// Fields we read to render a diff. Edit/MultiEdit carry old_string/new_string; Write carries
// content (a pure addition). All optional so partial/streaming input still renders a title.
const EditInput = z.object({
  file_path: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
})

type EditData = z.infer<typeof EditInput>
type Diff = {oldText: string; newText: string}

function basename(path: string | undefined): string {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

// The before/after sides of the edit, or undefined when there is nothing to diff (streaming).
// Write is a pure addition (empty before).
function diffOf(input: EditData | undefined): Diff | undefined {
  if (!input) return undefined
  const oldText = input.old_string ?? ''
  const newText = input.new_string ?? input.content ?? ''
  if (!oldText && !newText) return undefined
  return {oldText, newText}
}

function lineCount(text: string): number {
  return text ? text.split('\n').length : 0
}

function FileEditIcon(): JSX.Element {
  return <FilePen size={14} />
}

export function FileEditCard(props: ToolCardProps): JSX.Element {
  const path = () => parseInput(EditInput, props.part)?.file_path
  const name = () => basename(path())
  const verb = () => (props.part.name === 'Write' ? 'Wrote' : 'Edited')
  const diff = () => diffOf(parseInput(EditInput, props.part))
  const meta = () => {
    const d = diff()
    return d ? `+${lineCount(d.newText)} −${lineCount(d.oldText)}` : undefined
  }
  return (
    <ToolCard
      accent="code"
      Icon={FileEditIcon}
      title={name() ? `${verb()} ${name()}` : `${verb()} a file`}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      meta={meta()}
    >
      <Show when={diff()} fallback={<div class="text-[0.75rem] text-pw-text-3">no diff</div>}>
        {(d) => (
          <SolidFileDiff
            class="text-[0.75rem] rounded-pw-sm bg-pw-sunken max-w-full block overflow-auto"
            options={DIFF_OPTIONS}
            oldFile={{name: path() ?? 'file', contents: d().oldText}}
            newFile={{name: path() ?? 'file', contents: d().newText}}
          />
        )}
      </Show>
    </ToolCard>
  )
}

// This card renders the file-write tools (Edit/MultiEdit/Write).
export const fileEditTool: ToolCardEntry = {names: ['Edit', 'MultiEdit', 'Write'], render: FileEditCard}
