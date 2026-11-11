import {createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import type {openStore} from './open-store.js'
import {storeTables} from './store-tables.js'

export function createArtifacts(home: string) {
  return {
    write: (tx: Tx, artifact: Artifact): string => {
      const format = FORMATS[artifact.kind]
      const path = pathOf({artifact, extension: format.extension})
      const file = join(home, path)
      mkdirSync(dirname(file), {recursive: true})
      writeFileSync(file, artifact.bytes)
      const row = {
        run_id: artifact.run,
        session: artifact.session,
        target_id: artifact.target ?? null,
        check: artifact.check ?? null,
        round: artifact.round ?? null,
        width: artifact.width ?? null,
        kind: artifact.kind,
        path,
        content_type: format.type,
        size: artifact.bytes.length,
        checksum: createHash('sha256').update(artifact.bytes).digest('hex'),
        written: Date.now(),
      }
      tx.insert(storeTables.artifacts)
        .values(row)
        .onConflictDoUpdate({target: storeTables.artifacts.path, set: row})
        .run()
      return path
    },
    read: (path: string): Promise<Uint8Array | null> =>
      readFile(join(home, path)).then(
        (bytes) => new Uint8Array(bytes),
        () => null,
      ),
  }
}

export type Artifacts = ReturnType<typeof createArtifacts>

type Tx = Parameters<Parameters<ReturnType<typeof openStore>['orm']['transaction']>[0]>[0]

type Kind = (typeof storeTables.artifacts.$inferInsert)['kind']

type Artifact = {
  run: number
  session: string
  target?: string
  check?: number
  round?: number
  width?: number
  kind: Kind
  bytes: Uint8Array
}

const ARTIFACTS = 'artifacts'

const JSON_FILE = {type: 'application/json', extension: 'json'}

const PNG_FILE = {type: 'image/png', extension: 'png'}

const FORMATS: Record<Kind, {type: string; extension: string}> = {
  dom: JSON_FILE,
  cssom: JSON_FILE,
  fom: JSON_FILE,
  screenshot: PNG_FILE,
  diff: PNG_FILE,
  mask: PNG_FILE,
  figma: JSON_FILE,
  design: JSON_FILE,
  frame: PNG_FILE,
  source_diff: {type: 'text/x-diff', extension: 'diff'},
}

function pathOf(input: {artifact: Artifact; extension: string}): string {
  const {artifact} = input
  const levels = [artifact.target, artifact.check, artifact.width].flatMap((level) =>
    level === undefined ? [] : [String(level)],
  )
  return join(ARTIFACTS, String(artifact.run), ...levels, `${artifact.kind}.${input.extension}`)
}
