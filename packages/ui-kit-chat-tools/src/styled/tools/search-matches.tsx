import {For, Show, type JSX} from 'solid-js'
import {groupBy} from 'es-toolkit'
import {CodeBlock} from '@conciv/ui-kit-chat/tools'

export type SearchMatch = {file: string; line: number; snippet: string}

export type SearchFileGroup = {file: string; matches: SearchMatch[]}

const RECORD = /^(.+?):(\d+):(.*)$/

const MATCH_LINE = 'leading-[18px]'
const FILE_ROW = `flex items-baseline gap-2 min-w-0 pt-[3px] first:pt-0`
const FILE_PATH = `min-w-0 truncate text-[11px] ${MATCH_LINE} [font-family:var(--chat-mono)] text-chat-target`
const FILE_COUNT = `flex-none text-[10px] ${MATCH_LINE} [font-family:var(--chat-mono)] text-chat-dim`
const MATCH_ROW = 'flex items-start gap-2 min-w-0'
const LINE_NUMBER = `flex-none w-8 text-end tabular-nums text-[10.5px] ${MATCH_LINE} [font-family:var(--chat-mono)] text-chat-faint`
const SNIPPET = `min-w-0 flex-1 overflow-hidden ${MATCH_LINE} [--diffs-line-height:18px] [mask-image:linear-gradient(to_right,#000_calc(100%_-_1.25rem),transparent)]`
const GROUPS = 'flex flex-col min-w-0'

export function parseSearchMatches(text: string): SearchMatch[] {
  return text
    .split('\n')
    .map((line) => RECORD.exec(line.trimEnd()))
    .flatMap((match) => {
      const file = match?.[1]
      const line = match?.[2]
      const snippet = match?.[3]
      if (file === undefined || line === undefined || snippet === undefined) return []
      return [{file, line: Number(line), snippet}]
    })
}

export function groupSearchMatches(matches: readonly SearchMatch[]): SearchFileGroup[] {
  const byFile = groupBy(matches, (match) => match.file)
  return Object.entries(byFile).map(([file, entries]) => ({file, matches: entries}))
}

const HEADER_UNITS = 1
const MATCH_UNITS = 2

export function searchLineCount(groups: readonly SearchFileGroup[]): number {
  return groups.reduce((total, group) => total + HEADER_UNITS + group.matches.length * MATCH_UNITS, 0)
}

export function hiddenMatchSummary(
  groups: readonly SearchFileGroup[],
  hiddenLines: number,
): {matches: number; files: number} {
  const visibleUnits = Math.max(0, searchLineCount(groups) - hiddenLines)
  const seen = groups.reduce(
    (state, group) => {
      const headerUnits = Math.min(HEADER_UNITS, Math.max(0, visibleUnits - state.units))
      const room = Math.max(0, visibleUnits - state.units - headerUnits)
      const matchLines = Math.min(group.matches.length, Math.floor(room / MATCH_UNITS))
      return {
        units: state.units + HEADER_UNITS + group.matches.length * MATCH_UNITS,
        matches: state.matches + matchLines,
      }
    },
    {units: 0, matches: 0},
  )
  const total = groups.reduce((count, group) => count + group.matches.length, 0)
  const files = groups.filter((group) => group.matches.length > 0).length
  return {matches: total - seen.matches, files}
}

export function shortenPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 3) return path
  return `…/${segments.slice(-3).join('/')}`
}

function languageOf(file: string): string | undefined {
  const extension = file.split('.').pop()
  return extension && extension !== file ? extension : undefined
}

function Snippet(props: {file: string; snippet: string}): JSX.Element {
  return (
    <div class={SNIPPET}>
      <CodeBlock
        size="xs"
        chrome="line"
        file={{name: props.file, lang: languageOf(props.file), contents: props.snippet.trim()}}
      />
    </div>
  )
}

export function SearchMatches(props: {groups: SearchFileGroup[]}): JSX.Element {
  return (
    <div class={GROUPS}>
      <For each={props.groups}>
        {(group) => (
          <div class="min-w-0">
            <div class={FILE_ROW}>
              <span class={FILE_PATH}>{shortenPath(group.file)}</span>
              <Show when={group.matches.length > 1}>
                <span class={FILE_COUNT}>{group.matches.length}</span>
              </Show>
            </div>
            <For each={group.matches}>
              {(match) => (
                <div class={MATCH_ROW}>
                  <span class={LINE_NUMBER}>{match.line}</span>
                  <Snippet file={group.file} snippet={match.snippet} />
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}
