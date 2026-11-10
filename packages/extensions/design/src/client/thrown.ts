import type {z} from 'zod'
import type {ClientConsoleEntry} from '@conciv/extension'
import type {MeasureResultSchema} from '../shared/defs.js'

export function thrownOf(entries: ClientConsoleEntry[]): {thrown?: Thrown} {
  const last = entries.findLast((entry) => THROWN_LEVELS.has(entry.level))
  if (last === undefined) return {}
  const [first = '', ...rest] = last.text.split(LINE_BREAK)
  return {thrown: {message: first.trim(), frames: rest.flatMap(frameOf), ago: Date.now() - last.ts}}
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
  return placed(open < 0 ? trimmed.slice(FRAME_START.length) : trimmed.slice(open + 1, -1))
}

function placed(place: string): Frame[] {
  const columnAt = place.lastIndexOf(PLACE_SEPARATOR)
  const lineAt = place.lastIndexOf(PLACE_SEPARATOR, columnAt - 1)
  if (lineAt < 0) return []
  const frame = {
    fileName: place.slice(0, lineAt),
    line: Number(place.slice(lineAt + 1, columnAt)),
    column: Number(place.slice(columnAt + 1)),
  }
  return framed(frame) ? [frame] : []
}

function framed(frame: Frame): boolean {
  return (
    URL.canParse(frame.fileName) && Number.isInteger(frame.line) && frame.line > 0 && Number.isInteger(frame.column)
  )
}
