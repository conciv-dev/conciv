import {Show, type JSX} from 'solid-js'
import {Search as SearchIcon} from 'lucide-solid'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Search, useSearch} from '../../primitives/tools/search.js'
import {ToolCard} from '@conciv/ui-kit-chat'

function Icon(): JSX.Element {
  return <SearchIcon size={14} />
}

function Body(): JSX.Element {
  const search = useSearch()
  return (
    <ToolCard
      Icon={Icon}
      title={search.pattern() ? `${search.verb()} ${search.pattern()}` : `${search.verb()} files`}
      part={search.part()}
      result={search.result()}
      meta={search.meta()}
    >
      <Show when={search.count() > 0}>
        <pre class="text-[color:var(--chat-text-2)] text-[length:var(--chat-text-xs)] m-0 px-2.25 py-1.75 rounded-[var(--chat-radius-sm)] max-h-55 whitespace-pre [background:var(--chat-sunken)] [font-family:var(--chat-mono)] overflow-auto">
          {search.text()}
        </pre>
      </Show>
    </ToolCard>
  )
}

// Styled search card: a thin --chat-* wrapper over the headless Search primitive.
export function SearchCard(props: ToolCardProps): JSX.Element {
  return (
    <Search.Root part={props.part} result={props.result}>
      <Body />
    </Search.Root>
  )
}

export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard}
