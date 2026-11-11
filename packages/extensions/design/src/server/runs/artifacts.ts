import {createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import type {openStore} from './open-store.js'
import {storeTables} from './store-tables.js'

export function storeArtifacts(input: {
  tx: Tx
  home: string
  runId: number | null
  folder?: string
  artifacts: Artifact[]
}) {
  const {tx, home, runId} = input
  return input.artifacts.map((artifact) => {
    const path = join(input.folder ?? join(String(runId), artifact.kind), artifact.name)
    const file = join(home, ARTIFACTS, path)
    mkdirSync(dirname(file), {recursive: true})
    writeFileSync(file, artifact.bytes)
    const {lastInsertRowid} = tx
      .insert(storeTables.artifacts)
      .values({
        run_id: runId,
        kind: artifact.kind,
        width: artifact.width,
        path,
        size: artifact.bytes.length,
        checksum: createHash('sha256').update(artifact.bytes).digest('hex'),
        written: Date.now(),
      })
      .run()
    return {artifactId: Number(lastInsertRowid), path}
  })
}

type Tx = Parameters<Parameters<ReturnType<typeof openStore>['orm']['transaction']>[0]>[0]

type Artifact = {
  kind: (typeof storeTables.artifacts.$inferInsert)['kind']
  width: number | null
  name: string
  bytes: Uint8Array
}

const ARTIFACTS = 'artifacts'
