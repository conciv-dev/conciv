import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Search} from 'lucide-solid'
import {ToolCard} from '../shell.js'
import {parseInput, resultText} from '../util.js'
import type {ToolCardEntry, ToolCardProps} from '../types.js'

// Grep carries pattern (+ optional path/glob); Glob carries pattern. Both render a match list.
const SearchInput = z.object({pattern: z.string().optional(), path: z.string().optional(), glob: z.string().optional()})

function SearchIcon(): JSX.Element {
  return <Search size={14} />
}

// Count non-empty result lines as matches; 0 reads as "no matches".
function matchCount(result: ToolCardProps['result']): number {
  const text = resultText(result).trim()
  return text ? text.split('\n').filter((l) => l.trim().length > 0).length : 0
}

export function SearchCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(SearchInput, props.part)
  const pattern = () => input()?.pattern ?? ''
  const verb = () => (props.part.name === 'Glob' ? 'Globbed' : 'Searched')
  const count = () => matchCount(props.result)
  const meta = () => (props.result ? `${count()} ${count() === 1 ? 'match' : 'matches'}` : undefined)
  return (
    <ToolCard
      accent="read"
      Icon={SearchIcon}
      title={pattern() ? `${verb()} ${pattern()}` : `${verb()} files`}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      meta={meta()}
    >
      <Show when={count() > 0}>
        <pre class="text-[0.6875rem] text-pw-text-2 font-pw-mono m-0 px-2.25 py-1.75 rounded-pw-sm bg-pw-sunken max-h-55 whitespace-pre overflow-auto">
          {resultText(props.result)}
        </pre>
      </Show>
    </ToolCard>
  )
}

// This card renders the search tools (Grep and Glob).
export const searchTool: ToolCardEntry = {names: ['Grep', 'Glob'], render: SearchCard}
