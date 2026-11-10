import type {SQLInputValue} from 'node:sqlite'
import type {openRunsStore} from './runs-store.js'

export function queryRuns(input: {runsStore: RunsStore; sql: string; params?: SQLInputValue[]}): Answer {
  const statement = input.runsStore.reader.prepare(input.sql)
  return {
    columns: statement.columns().map((column) => column.name),
    rows: statement.all(...(input.params ?? [])),
  }
}

type RunsStore = ReturnType<typeof openRunsStore>

type Answer = {columns: string[]; rows: Record<string, SQLInputValue>[]}
