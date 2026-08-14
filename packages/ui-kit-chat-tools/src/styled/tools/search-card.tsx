import {Show, type JSX} from 'solid-js'
import SearchIcon from 'lucide-solid/icons/search'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import type {ToolStatus} from '@conciv/ui-kit-chat/tools'
import {Search, useSearch} from '../../primitives/tools/search.js'
import {CodeBlock, QUIET_TEXT_CLASS, ToolCard} from '@conciv/ui-kit-chat/tools'

function Icon(): JSX.Element {
  return <SearchIcon size={14} />
}

function emptyLabel(status: ToolStatus): string {
  if (status === 'running') return 'searching…'
  if (status === 'error') return 'the search failed'
  return 'no matches'
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
      <Show when={search.count() > 0} fallback={<p class={QUIET_TEXT_CLASS}>{emptyLabel(search.status())}</p>}>
        <CodeBlock size="xs" maxHeight="result" file={{name: 'results.txt', lang: 'text', contents: search.text()}} />
      </Show>
    </ToolCard>
  )
}

export function SearchCard(props: ToolCardProps): JSX.Element {
  return (
    <Search.Root part={props.part} result={props.result}>
      <Body />
    </Search.Root>
  )
}

export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard}
