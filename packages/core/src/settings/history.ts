import {appendFileSync, mkdirSync, readFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {SettingsHistoryEntrySchema, type SettingsHistoryEntry} from '@conciv/protocol/settings-types'
import {logError} from '../lib/debug.js'

export function appendHistory(path: string, entry: SettingsHistoryEntry): void {
  try {
    mkdirSync(dirname(path), {recursive: true})
    appendFileSync(path, `${JSON.stringify(entry)}\n`)
  } catch (error) {
    logError(`[core] the settings history sidecar could not be appended: ${String(error)}`)
  }
}

function parseLine(line: string): SettingsHistoryEntry | null {
  try {
    const parsed = SettingsHistoryEntrySchema.safeParse(JSON.parse(line))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function readHistory(path: string, key: string): SettingsHistoryEntry[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .toReversed()
      .flatMap((line) => {
        if (line.trim() === '') return []
        const entry = parseLine(line)
        return entry !== null && entry.key === key ? [entry] : []
      })
  } catch {
    return []
  }
}
