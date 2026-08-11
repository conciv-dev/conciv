import {Show, type JSX} from 'solid-js'
import FilePen from 'lucide-solid/icons/file-pen'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {FileEdit, useFileEdit} from '../../primitives/tools/file-edit.js'
import {DiffBlock, ToolCard} from '@conciv/ui-kit-chat/tools'

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

export const fileEditTool: ToolCardEntry = {names: ['Edit', 'MultiEdit', 'Write'], render: FileEditCard}
