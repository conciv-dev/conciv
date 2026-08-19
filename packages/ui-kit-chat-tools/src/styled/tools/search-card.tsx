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
  DANGER_TEXT_CLASS,
  formatDuration,
  parseInput,
  QUIET_TEXT_CLASS,
  resultText,
  rowMarkOf,
  StatusVisual,
  toolStatus,
  ToolCard,
  TraceOutputBlock,
  useToolCallDuration,
} from '@conciv/ui-kit-chat/tools'

const HEADER_ICON_CLASS = 'text-chat-text-3 inline-flex shrink-0 items-center'
const HEADER_TITLE_CLASS = 'text-chat-text flex-1 min-w-0 truncate'
const HEADER_PATTERN_CLASS = '[font-family:var(--chat-mono)]'
const HEADER_METRIC_CLASS =
  'text-chat-text-3 text-[length:var(--chat-text-xs)] flex-none min-w-0 max-w-[35%] truncate [font-family:var(--chat-mono)] tabular-nums'

function Icon(): JSX.Element {
  return <SearchIcon size={14} />
}

function emptyLabel(status: ToolStatus): string {
  if (status === 'running') return 'searching…'
  if (status === 'error') return 'the search failed'
  return 'no matches'
}

function emptyClass(status: ToolStatus): string {
  return status === 'error' ? DANGER_TEXT_CLASS : QUIET_TEXT_CLASS
}

function plainTitle(verb: string, pattern: string): string {
  return pattern ? `${verb} "${pattern}"` : `${verb} files`
}

function SearchTitle(props: {verb: string; pattern: string}): JSX.Element {
  return (
    <Show when={props.pattern} fallback={<span class={HEADER_TITLE_CLASS}>{props.verb} files</span>}>
      {(pattern) => (
        <span class={HEADER_TITLE_CLASS}>
          {props.verb} <span class={HEADER_PATTERN_CLASS}>“{pattern()}”</span>
        </span>
      )}
    </Show>
  )
}

function SearchHeader(): JSX.Element {
  const search = useSearch()
  const status = () => toolStatus(search.part(), search.result())
  const ambientDuration = useToolCallDuration()
  const duration = () => formatDuration(ambientDuration())
  return (
    <>
      <span class={HEADER_ICON_CLASS} aria-hidden="true">
        <Icon />
      </span>
      <SearchTitle verb={search.verb()} pattern={search.pattern()} />
      <Show when={search.meta()}>{(meta) => <span class={HEADER_METRIC_CLASS}>{meta()}</span>}</Show>
      <Show when={duration()}>{(value) => <span class={HEADER_METRIC_CLASS}>{value()}</span>}</Show>
      <StatusVisual status={status()} form="dot" />
    </>
  )
}

function Body(): JSX.Element {
  const search = useSearch()
  return (
    <ToolCard
      Icon={Icon}
      title={plainTitle(search.verb(), search.pattern())}
      header={<SearchHeader />}
      part={search.part()}
      result={search.result()}
      meta={search.meta()}
    >
      <Show
        when={search.count() > 0}
        fallback={<p class={emptyClass(search.status())}>{emptyLabel(search.status())}</p>}
      >
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
  const value = input?.pattern ?? input?.glob
  return value ? `"${value}"` : 'the workspace'
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

function searchBlock(text: string, failed: boolean): () => JSX.Element {
  const matches = failed ? [] : parseSearchMatches(text)
  if (matches.length === 0)
    return () => (
      <TraceOutputBlock text={text} tone={failed ? 'error' : 'normal'}>
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

function searchMeta(result: ToolRowProps['result'], failed: boolean, matches: number): string | undefined {
  if (failed) return 'failed'
  if (result === undefined) return undefined
  return countLabel(matches, 'match', 'matches')
}

export function searchRowProjection(source: ToolRowProps): ToolRowProjection {
  const failed = source.result?.state === 'error'
  const text = resultText(source.result).trim()
  const matches = failed ? 0 : matchCount(text)
  return {
    mark: rowMarkOf(source.part, source.result),
    label: 'search',
    target: searchTarget(source.part),
    meta: searchMeta(source.result, failed, matches),
    block: text.length === 0 ? undefined : searchBlock(text, failed),
  }
}

export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard, row: searchRowProjection}
