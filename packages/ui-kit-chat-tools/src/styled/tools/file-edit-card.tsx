import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import FilePen from 'lucide-solid/icons/file-pen'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import {FileEdit, useFileEdit} from '../../primitives/tools/file-edit.js'
import {DiffBlock, parseInput, rowMarkOf, ToolCard, TraceOutputBlock} from '@conciv/ui-kit-chat/tools'

function Icon(): JSX.Element {
  return <FilePen size={14} />
}

function Body(): JSX.Element {
  const edit = useFileEdit()
  return (
    <ToolCard
      Icon={Icon}
      title={edit.name() ? `${edit.verb()} ${edit.name()}` : `${edit.verb()} a file`}
      part={edit.part()}
      result={edit.result()}
      meta={edit.meta()}
    >
      <Show when={edit.diff()} fallback={<span class="text-chat-text-3">no diff</span>}>
        {(diff) => (
          <DiffBlock size="sm" file={{name: edit.path() ?? 'file', before: diff().oldText, after: diff().newText}} />
        )}
      </Show>
    </ToolCard>
  )
}

export function FileEditCard(props: ToolCardProps): JSX.Element {
  return (
    <FileEdit.Root part={props.part} result={props.result}>
      <Body />
    </FileEdit.Root>
  )
}

const EditRowInput = z.object({
  file_path: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
  edits: z.array(z.object({old_string: z.string().optional(), new_string: z.string().optional()})).optional(),
})

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function lineCount(text: string | undefined): number {
  return text ? text.split('\n').length : 0
}

type EditParts = {path: string; before: string; after: string}

const NO_EDIT: EditParts = {path: '', before: '', after: ''}

type EditInput = z.infer<typeof EditRowInput>

function joinEdits(input: EditInput, key: 'old_string' | 'new_string'): string {
  return (input.edits ?? [])
    .map((edit) => edit[key] ?? '')
    .filter((text) => text.length > 0)
    .join('\n')
}

function beforeTextOf(input: EditInput): string {
  return input.old_string ?? joinEdits(input, 'old_string')
}

function newTextOf(input: EditInput): string {
  return input.new_string ?? input.content ?? joinEdits(input, 'new_string')
}

function editParts(part: ToolRowProps['part']): EditParts {
  const input = parseInput(EditRowInput, part)
  if (!input) return NO_EDIT
  return {path: input.file_path ?? '', before: beforeTextOf(input), after: newTextOf(input)}
}

const DIFF_DENSITY = '[--diffs-gap-block:2px] [--diffs-line-height:18px]'

function editBlock(parts: EditParts): () => JSX.Element {
  return () => (
    <TraceOutputBlock label="Diff" size="tall" text={parts.after}>
      <DiffBlock
        size="xs"
        class={DIFF_DENSITY}
        file={{name: parts.path || 'file', before: parts.before, after: parts.after}}
      />
    </TraceOutputBlock>
  )
}

export function fileEditRowProjection(source: ToolRowProps): ToolRowProjection {
  const parts = editParts(source.part)
  const hasDiff = Boolean(parts.before || parts.after)
  return {
    mark: rowMarkOf(source.part, source.result),
    label: source.part.name === 'Write' ? 'write' : 'edit',
    target: parts.path ? basename(parts.path) : 'a file',
    meta: hasDiff ? `+${lineCount(parts.after)} −${lineCount(parts.before)}` : undefined,
    block: hasDiff ? editBlock(parts) : undefined,
  }
}

export const fileEditTool: ToolCardEntry = {
  names: ['Edit', 'MultiEdit', 'Write'],
  render: FileEditCard,
  row: fileEditRowProjection,
}
