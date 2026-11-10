import {desc, isNull} from 'drizzle-orm'
import type {ExtensionDb} from '@conciv/extension'
import type {designTables} from '../tables.js'

export async function openRun(db: ExtensionDb<ReturnType<typeof designTables>>): Promise<number | null> {
  const {runs} = db.tables
  const [open] = await db.orm
    .select({run: runs.run_id})
    .from(runs)
    .where(isNull(runs.ended))
    .orderBy(desc(runs.run_id))
    .limit(1)
  return open?.run ?? null
}
