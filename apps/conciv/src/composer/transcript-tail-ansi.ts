import type {TranscriptTailEntry} from '@conciv/contract'

const RESET = '\u001b[0m'
const WHITE = '\u001b[97m'
const ORANGE = '\u001b[38;5;215m'
const DIM = '\u001b[2m'
const THINKING = '\u001b[3;38;5;141m'
const BORDER = '\u001b[38;5;240m'
const CURSOR = '\u001b[5m\u001b[7m \u001b[27m\u001b[25m'

export const ASSISTANT_MARK = '●'
export const TOOL_MARK = '⏺'
export const RESULT_MARK = '⎿'
export const THINKING_MARK = '✳'
export const PROMPT_MARK = '>'

export const PREVIEW_COLS = 58

export type TranscriptTailOptions = {working: boolean; cols?: number}

function clip(text: string, width: number): string {
  if (width < 2) return ''
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

function entryLines(entry: TranscriptTailEntry, cols: number): string[] {
  if (entry.role === 'user') return [`${DIM}${PROMPT_MARK} ${clip(entry.text, cols - 2)}${RESET}`]
  if (entry.role === 'assistant') return [`${WHITE}${ASSISTANT_MARK} ${clip(entry.text, cols - 2)}${RESET}`]
  const name = entry.toolName ?? 'tool'
  const call = `${ORANGE}${TOOL_MARK} ${clip(name, cols - 2)}${RESET}`
  if (entry.toolResult === undefined) return [call]
  return [call, `${DIM}  ${RESULT_MARK} ${clip(entry.toolResult, cols - 5)}${RESET}`]
}

function promptBox(cols: number, working: boolean): string[] {
  const inner = Math.max(cols - 2, 4)
  const rule = '─'.repeat(inner)
  const cursor = working ? CURSOR : ''
  const filled = 3 + (working ? 1 : 0)
  const pad = ' '.repeat(Math.max(inner - filled, 0))
  return [
    `${BORDER}╭${rule}╮${RESET}`,
    `${BORDER}│${RESET} ${PROMPT_MARK} ${cursor}${pad}${BORDER}│${RESET}`,
    `${BORDER}╰${rule}╯${RESET}`,
  ]
}

export function renderTranscriptTail(entries: TranscriptTailEntry[], opts: TranscriptTailOptions): string {
  const cols = opts.cols ?? PREVIEW_COLS
  const body = entries.flatMap((entry) => entryLines(entry, cols))
  const thinking = opts.working ? [`${THINKING}${THINKING_MARK} Thinking…${RESET}`] : []
  return [...body, ...thinking, '', ...promptBox(cols, opts.working)].join('\r\n')
}
