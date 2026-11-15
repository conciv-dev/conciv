import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import type {BrowserCommand} from 'vitest/node'
import {z} from 'zod'

const PerfRecordSchema = z.object({
  median: z.number(),
  budgetMs: z.number(),
  toleranceMs: z.number(),
  broken: z.array(z.string()),
  samples: z.array(z.string()),
})

const PerfMediansSchema = z.record(z.string(), z.record(z.string(), PerfRecordSchema))

export type PerfRecord = z.infer<typeof PerfRecordSchema>

export type PerfMedians = z.infer<typeof PerfMediansSchema>

function readMedians(file: string): PerfMedians {
  return PerfMediansSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

const perfBaseline: BrowserCommand<[]> = () => {
  const file = process.env.CONCIV_PERF_BASELINE
  if (!file) return null
  return readMedians(file)
}

const recordPerfMedian: BrowserCommand<[browser: string, scenario: string, record: PerfRecord]> = (
  _context,
  browser,
  scenario,
  record,
) => {
  const file = process.env.CONCIV_PERF_RECORD
  if (!file) return
  const recorded = existsSync(file) ? readMedians(file) : {}
  writeFileSync(file, JSON.stringify({...recorded, [browser]: {...recorded[browser], [scenario]: record}}, null, 2))
}

export const perfCommands = {perfBaseline, recordPerfMedian}
