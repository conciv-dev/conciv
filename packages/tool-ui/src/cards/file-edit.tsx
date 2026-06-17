import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {SolidFileDiff} from '@opendui/aidx-solid-diffs'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// Fields we read to render a diff. Edit/MultiEdit carry old_string/new_string; Write carries
// content (a pure addition). All optional so partial/streaming input still renders a title.
const EditInput = z.object({
  file_path: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
})

type EditData = z.infer<typeof EditInput>

function basename(path: string | undefined): string {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

// The before/after sides for the diff. Write is a pure addition (empty before).
function sides(input: EditData): {oldText: string; newText: string} {
  return {oldText: input.old_string ?? '', newText: input.new_string ?? input.content ?? ''}
}

function lineCount(text: string): number {
  return text ? text.split('\n').length : 0
}

function FileEditIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-edit" aria-hidden="true">
      ✎
    </span>
  )
}

export function FileEditCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(EditInput, props.part)
  const path = () => input()?.file_path
  const name = () => basename(path())
  const verb = () => (props.part.name === 'Write' ? 'Wrote' : 'Edited')
  const removed = () => {
    const i = input()
    return i ? lineCount(sides(i).oldText) : 0
  }
  const added = () => {
    const i = input()
    return i ? lineCount(sides(i).newText) : 0
  }
  const hasDiff = () => added() > 0 || removed() > 0
  const meta = () => (hasDiff() ? `+${added()} −${removed()}` : undefined)
  return (
    <ToolCard
      accent="code"
      Icon={FileEditIcon}
      title={name() ? `${verb()} ${name()}` : `${verb()} a file`}
      part={props.part}
      result={props.result}
      meta={meta()}
    >
      <Show when={hasDiff()} fallback={<div class="pw-tool-muted">no diff</div>}>
        <SolidFileDiff
          class="pw-edit-diff"
          oldFile={{name: path() ?? 'file', contents: sides(input()!).oldText}}
          newFile={{name: path() ?? 'file', contents: sides(input()!).newText}}
        />
      </Show>
    </ToolCard>
  )
}
