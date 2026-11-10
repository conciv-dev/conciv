import {eq} from 'drizzle-orm'
import {z} from 'zod'
import type {ExtensionDb} from '@conciv/extension'
import {RUN_VERDICTS} from '../../../shared/run-verdicts.js'
import type {designTables} from '../../tables.js'
import {openRun} from '../open-run.js'

export async function runEnd(input: {
  db: ExtensionDb<ReturnType<typeof designTables>>
  verdict: string
  cost: number | null
}) {
  const {runs} = input.db.tables
  const open = await openRun(input.db)
  if (open === null) throw new Error('no run is open; call run start first')
  const [row] = await input.db.orm
    .update(runs)
    .set({ended: Date.now(), verdict: z.enum(RUN_VERDICTS).parse(input.verdict), cost: input.cost})
    .where(eq(runs.run_id, open))
    .returning()
  return row
}
