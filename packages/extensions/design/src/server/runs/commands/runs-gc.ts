import {rmSync} from 'node:fs'
import {join} from 'node:path'
import {inArray} from 'drizzle-orm'
import {openStore} from '../open-store.js'
import {storeTables} from '../store-tables.js'

export function runsGc(input: {home: string}) {
  const {artifacts} = storeTables
  const store = openStore(input.home)
  try {
    const now = Date.now()
    const stored = store.orm.select().from(artifacts).all()
    const expired = stored.filter((artifact) => expiredAt(artifact) <= now)
    const files = expired.map((artifact) => join(input.home, ARTIFACTS, artifact.path))
    files.forEach((file) => rmSync(file, {force: true}))
    store.orm
      .delete(artifacts)
      .where(
        inArray(
          artifacts.artifact_id,
          expired.map((artifact) => artifact.artifact_id),
        ),
      )
      .run()
    return {removed: files, kept: stored.length - expired.length}
  } finally {
    store.close()
  }
}

const ARTIFACTS = 'artifacts'

function expiredAt(artifact: {written: number; lifetime: string}): number {
  if (artifact.lifetime === 'infinite') return Infinity
  const ends = new Date(artifact.written)
  ends.setDate(ends.getDate() + Number(artifact.lifetime))
  return ends.getTime()
}
