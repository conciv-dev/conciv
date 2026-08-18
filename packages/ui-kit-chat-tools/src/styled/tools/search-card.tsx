import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import SearchIcon from 'lucide-solid/icons/search'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import type {ToolStatus} from '@conciv/ui-kit-chat/tools'
import {Search, useSearch} from '../../primitives/tools/search.js'
import {
  groupSearchMatches,
  hiddenMatchSummary,
  parseSearchMatches,
  searchLineCount,
  SearchMatches,
  type SearchFileGroup,
} from './search-matches.js'
import {
  CodeBlock,
  countLabel,
  parseInput,
  QUIET_TEXT_CLASS,
  resultText,
  rowMarkOf,
  ToolCard,
  TraceOutputBlock,
} from '@conciv/ui-kit-chat/tools'

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

const SearchRowInput = z.object({pattern: z.string().optional(), glob: z.string().optional()})

function searchTarget(part: ToolRowProps['part']): string {
  const input = parseInput(SearchRowInput, part)
  return input?.pattern ?? input?.glob ?? 'the workspace'
}

function matchCount(text: string): number {
  return text.split('\n').filter((line) => line.trim().length > 0).length
}

function matchOverflowLabel(groups: SearchFileGroup[]): (hidden: number) => string {
  return (hidden) => {
    const summary = hiddenMatchSummary(groups, hidden)
    return `… ${countLabel(summary.matches, 'more match', 'more matches')} in ${countLabel(summary.files, 'file', 'files')}`
  }
}

function searchBlock(text: string): () => JSX.Element {
  const matches = parseSearchMatches(text)
  if (matches.length === 0)
    return () => (
      <TraceOutputBlock text={text}>
        <CodeBlock size="xs" file={{name: 'results.txt', lang: 'text', contents: text}} />
      </TraceOutputBlock>
    )
  const groups = groupSearchMatches(matches)
  return () => (
    <TraceOutputBlock
      text={text}
      label="Matches"
      lines={searchLineCount(groups)}
      overflowLabel={matchOverflowLabel(groups)}
    >
      <SearchMatches groups={groups} />
    </TraceOutputBlock>
  )
}

export function searchRowProjection(source: ToolRowProps): ToolRowProjection {
  const failed = source.result?.state === 'error'
  const text = resultText(source.result).trim()
  const matches = failed ? 0 : matchCount(text)
  return {
    mark: rowMarkOf(source.part, source.result),
    label: 'search',
    target: searchTarget(source.part),
    meta: source.result === undefined || failed ? undefined : countLabel(matches, 'match', 'matches'),
    block: text.length === 0 ? undefined : searchBlock(text),
  }
}

export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard, row: searchRowProjection}
