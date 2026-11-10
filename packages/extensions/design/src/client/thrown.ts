import type {z} from 'zod'
import type {ClientConsoleEntry} from '@conciv/extension'
import type {MeasureResultSchema} from '../shared/defs.js'

export function thrownOf(entries: ClientConsoleEntry[]): Thrown | null {
  const last = entries.findLast((entry) => THROWN_LEVELS.has(entry.level))
  if (last === undefined) return null
  const [first = '', ...rest] = last.text.split(LINE_BREAK)
  return {message: first.trim(), frames: rest.flatMap(frameOf), ago: Date.now() - last.ts}
}

type Thrown = NonNullable<z.output<typeof MeasureResultSchema>['thrown']>

type Frame = Thrown['frames'][number]

const THROWN_LEVELS = new Set(['uncaught', 'unhandled'])

const LINE_BREAK = '\n'

const FRAME_START = 'at '

const CALL_OPEN = '('

const PLACE_SEPARATOR = ':'

function frameOf(line: string): Frame[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith(FRAME_START)) return []
  const open = trimmed.lastIndexOf(CALL_OPEN)
  const place = open < 0 ? trimmed.slice(FRAME_START.length) : trimmed.slice(open + 1, -1)
  const columnAt = place.lastIndexOf(PLACE_SEPARATOR)
  const lineAt = place.lastIndexOf(PLACE_SEPARATOR, columnAt - 1)
  const fileName = place.slice(0, lineAt)
  const row = Number(place.slice(lineAt + 1, columnAt))
  const column = Number(place.slice(columnAt + 1))
  if (lineAt < 0 || !URL.canParse(fileName) || !Number.isInteger(row) || row < 1 || !Number.isInteger(column)) return []
  return [{fileName, line: row, column}]
}
