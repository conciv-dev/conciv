import type {ExtensionDb} from '@conciv/extension'
import type {designTables} from '../../tables.js'
import {provenanceOf} from './provenance.js'

export async function runStart(input: {
  db: ExtensionDb<ReturnType<typeof designTables>>
  cwd: string
  extensionDir: string
  model: string
  promptHead: string
  wave: string | null
  lane: string | null
}) {
  const {db, cwd, extensionDir, model, promptHead, wave, lane} = input
  const [row] = await db.orm
    .insert(db.tables.runs)
    .values({
      model,
      prompt_head: promptHead,
      started: Date.now(),
      wave,
      lane,
      ...(await provenanceOf({cwd, extensionDir})),
    })
    .returning()
  return row
}
