import {createMemo, Show, type JSX} from 'solid-js'
import SearchIcon from 'lucide-solid/icons/search'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import type {ToolStatus} from '@conciv/ui-kit-chat/tools'
import {Search, useSearch} from '../../primitives/tools/search.js'
import {
  groupSearchMatches,
  hiddenMatchSummary,
  parseSearchMatches,
  searchLineCount,
  SearchMatches,
} from './search-matches.js'
import {
  CodeBlock,
  countLabel,
  DANGER_TEXT_CLASS,
  formatDuration,
  QUIET_TEXT_CLASS,
  StatusVisual,
  toolStatus,
  ToolCard,
  TraceOutputBlock,
  useEmbeddedCard,
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
    <Show when={props.pattern} fallback={<TruncatedText class={HEADER_TITLE_CLASS} text={`${props.verb} files`} />}>
      {(pattern) => (
        <TruncatedText class={HEADER_TITLE_CLASS} text={`${props.verb} “${pattern()}”`}>
          {props.verb} <span class={HEADER_PATTERN_CLASS}>“{pattern()}”</span>
        </TruncatedText>
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
      <Show when={search.meta()}>{(meta) => <TruncatedText class={HEADER_METRIC_CLASS} text={meta()} />}</Show>
      <Show when={duration()}>{(value) => <TruncatedText class={HEADER_METRIC_CLASS} text={value()} />}</Show>
      <StatusVisual status={status()} form="dot" />
    </>
  )
}

function matchOverflowLabel(groups: ReturnType<typeof groupSearchMatches>): (hidden: number) => string {
  return (hidden) => {
    const summary = hiddenMatchSummary(groups, hidden)
    return `… ${countLabel(summary.matches, 'more match', 'more matches')} in ${countLabel(summary.files, 'file', 'files')}`
  }
}

function EmbeddedResults(props: {text: string; failed: boolean}): JSX.Element {
  const matches = () => (props.failed ? [] : parseSearchMatches(props.text))
  const groups = createMemo(() => groupSearchMatches(matches()))
  return (
    <Show
      when={matches().length > 0}
      fallback={
        <TraceOutputBlock text={props.text} tone={props.failed ? 'error' : 'normal'}>
          <CodeBlock size="xs" file={{name: 'results.txt', lang: 'text', contents: props.text}} />
        </TraceOutputBlock>
      }
    >
      <TraceOutputBlock
        text={props.text}
        label="Matches"
        lines={searchLineCount(groups())}
        overflowLabel={matchOverflowLabel(groups())}
      >
        <SearchMatches groups={groups()} />
      </TraceOutputBlock>
    </Show>
  )
}

function Body(): JSX.Element {
  const search = useSearch()
  const embedded = useEmbeddedCard()
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
        when={search.count() > 0 || search.status() === 'error'}
        fallback={<p class={emptyClass(search.status())}>{emptyLabel(search.status())}</p>}
      >
        <Show
          when={embedded()}
          fallback={
            <CodeBlock
              size="xs"
              maxHeight="result"
              file={{name: 'results.txt', lang: 'text', contents: search.text()}}
            />
          }
        >
          <EmbeddedResults text={search.text()} failed={search.status() === 'error'} />
        </Show>
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

export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard, hasEmbeddedBody: () => true}
