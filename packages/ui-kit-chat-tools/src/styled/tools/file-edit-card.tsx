import {Show, type JSX} from 'solid-js'
import {FilePen} from 'lucide-solid'
import {SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {FileEdit, useFileEdit} from '../../primitives/tools/file-edit.js'
import {ToolCard} from '@conciv/ui-kit-chat'

const DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  diffStyle: 'unified',
  overflow: 'wrap',
}
const DIFF_CLASS =
  'text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-w-full block overflow-auto'

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
      <Show when={edit.diff()} fallback={<span class="text-[color:var(--chat-text-3)]">no diff</span>}>
        {(diff) => (
          <SolidFileDiff
            class={DIFF_CLASS}
            options={DIFF_OPTIONS}
            oldFile={{name: edit.path() ?? 'file', contents: diff().oldText}}
            newFile={{name: edit.path() ?? 'file', contents: diff().newText}}
          />
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

export const fileEditTool: ToolCardEntry = {names: ['Edit', 'MultiEdit', 'Write'], render: FileEditCard}
