import {desc, eq, isNull} from 'drizzle-orm'
import type {ExtensionDb} from '@conciv/extension'
import type {designTables} from './tables.js'

export function createRuns(db: ExtensionDb<ReturnType<typeof designTables>>) {
  const {orm, tables} = db
  const {runs, targets} = tables

  async function current(): Promise<number | null> {
    const [open] = await orm
      .select({run: runs.run_id})
      .from(runs)
      .where(isNull(runs.ended))
      .orderBy(desc(runs.run_id))
      .limit(1)
    return open?.run ?? null
  }

  return {
    current,
    start: async (input: {model: string; promptHead: string}) => {
      const [target] = await orm.select({id: targets.target_id}).from(targets).orderBy(desc(targets.at)).limit(1)
      const [row] = await orm
        .insert(runs)
        .values({target_id: target?.id ?? null, model: input.model, prompt_head: input.promptHead, started: Date.now()})
        .returning()
      return row
    },
    end: async (input: {verdict: string; cost: number | null}) => {
      const run = await current()
      if (run === null) throw new Error('no run is open; call runs start first')
      const [row] = await orm
        .update(runs)
        .set({ended: Date.now(), verdict: input.verdict, cost: input.cost})
        .where(eq(runs.run_id, run))
        .returning()
      return row
    },
  }
}
