import type {ToolCardProps} from '@conciv/types/tool-view-types'
import type {ToolCardEntry} from '@conciv/ui-kit-chat/tools'
import {bashTool} from './bash-card.js'
import {applyPatchTool} from './apply-patch-diff.js'
import {discoveredApisTool} from './discovered-apis-card.js'
import {fileEditTool} from './file-edit-card.js'
import {fileReadTool} from './file-read-card.js'
import {searchTool} from './search-card.js'
import {todoTool} from './todo-card.js'
import {Show, type JSX} from 'solid-js'
import Wrench from 'lucide-solid/icons/wrench'
import {z} from 'zod'
import {Chip, QUIET_TEXT_CLASS, ToolCard, parseInput} from '@conciv/ui-kit-chat/tools'

const LookupInput = z.object({query: z.string().optional()})

function Icon(): JSX.Element {
  return <Wrench size={14} />
}

export function ToolLookupCard(props: ToolCardProps): JSX.Element {
  const query = () => parseInput(LookupInput, props.part)?.query
  return (
    <ToolCard Icon={Icon} title="Loaded tools" part={props.part} result={props.result}>
      <Show when={query()} fallback={<p class={QUIET_TEXT_CLASS}>no query</p>}>
        {(value) => <Chip kind="pill" value={value()} />}
      </Show>
    </ToolCard>
  )
}

const toolLookupTool: ToolCardEntry = {
  names: ['ToolSearch'],
  render: ToolLookupCard,
  hasEmbeddedBody: () => true,
}

export const builtinToolCards: ToolCardEntry[] = [
  bashTool,
  applyPatchTool,
  discoveredApisTool,
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
  toolLookupTool,
]
