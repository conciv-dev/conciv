import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {parseInput, resultText} from '@conciv/ui-kit-chat'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'

const SearchInput = z.object({pattern: z.string().optional(), path: z.string().optional(), glob: z.string().optional()})

function matchCount(result: ToolResultPart | undefined): number {
  const text = resultText(result).trim()
  return text ? text.split('\n').filter((line) => line.trim().length > 0).length : 0
}

type SearchContextValue = {
  part: Accessor<ToolCallPart>
  result: Accessor<ToolResultPart | undefined>
  pattern: Accessor<string>
  verb: Accessor<string>
  count: Accessor<number>
  meta: Accessor<string | undefined>
  text: Accessor<string>
  status: Accessor<ToolStatus>
}

const SearchContext = createContext<SearchContextValue>()

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext)
  if (!context) throw new Error('Search sub-components must be used within Search.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const pattern = () => parseInput(SearchInput, props.part)?.pattern ?? ''
  const verb = () => (props.part.name === 'Glob' ? 'Globbed' : 'Searched')
  const count = createMemo(() => matchCount(props.result))
  const meta = () => (props.result ? `${count()} ${count() === 1 ? 'match' : 'matches'}` : undefined)
  const text = () => resultText(props.result)
  const status = createMemo(() => toolStatus(props.part, props.result))
  return (
    <SearchContext.Provider
      value={{part: () => props.part, result: () => props.result, pattern, verb, count, meta, text, status}}
    >
      {props.children}
    </SearchContext.Provider>
  )
}

export const Search = Object.assign(Root, {Root})
