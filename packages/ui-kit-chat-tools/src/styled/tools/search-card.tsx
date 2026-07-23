import {Show, type JSX} from 'solid-js'
import {Search as SearchIcon} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Search, useSearch} from '../../primitives/tools/search.js'
import {ToolCard} from '@conciv/ui-kit-chat'

const OUT_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
}
const OUT_CLASS =
  'block max-w-full max-h-55 overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)]'

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
        <SolidCodeBlock
          class={OUT_CLASS}
          options={OUT_OPTIONS}
          file={{name: 'results.txt', lang: 'text', contents: search.text()}}
        />
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
