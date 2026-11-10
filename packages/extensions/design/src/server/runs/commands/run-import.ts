import {existsSync} from 'node:fs'
import {readdir, readFile} from 'node:fs/promises'
import {basename, join, parse, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mapValues} from 'es-toolkit'
import {packTar} from 'modern-tar/fs'
import {z} from 'zod'
import {dbFile, type CommandValues} from '@conciv/db'
import {designConfig} from '../../../shared/tolerances.js'
import {openStore} from '../open-store.js'
import {storeTables} from '../store-tables.js'
import {copyRun} from '../import/copy-run.js'
import {storeArtifacts} from '../import/store-artifacts.js'

export async function runImport(input: {home: string; dir: string; options: CommandValues}) {
  const options = ImportOptionsSchema.parse(input.options)
  const lifetimes = LifetimesSchema.parse({
    ...designConfig.runs.lifetimes,
    ...Object.fromEntries(options.lifetime.map((entry) => entry.split('='))),
  })
  const gathered = await Promise.all([
    widthFiles({dir: options.design, kind: 'design'}),
    widthFiles({dir: options.screenshots, kind: 'screenshot'}),
    options.source === undefined
      ? []
      : [
          {
            kind: 'source' as const,
            width: null,
            name: SOURCE_TAR,
            bytes: Buffer.concat(await packTar(options.source).toArray()),
          },
        ],
    options.transcript === undefined
      ? []
      : [
          {
            kind: 'transcript' as const,
            width: null,
            name: basename(options.transcript),
            bytes: await readFile(options.transcript),
          },
        ],
  ])
  const artifacts = gathered.flat().map((artifact) => ({...artifact, lifetime: lifetimes[artifact.kind]}))
  const sourcePath = resolve(input.dir)
  const {path} = dbFile(sourcePath)
  const store = openStore(input.home)
  const client = store.orm.$client
  client
    .prepare('ATTACH DATABASE ? AS source')
    .run(`${pathToFileURL(path).href}?${existsSync(`${path}-wal`) ? 'mode=ro' : 'immutable=1'}`)
  try {
    return store.orm.transaction(
      (tx) => {
        const copied = copyRun({tx, sourcePath})
        if (!copied.imported) return {...copied, artifacts: []}
        if (options.lane !== undefined)
          tx.insert(storeTables.lanes)
            .values({run_id: copied.runId, path: resolve(options.lane), registered: Date.now()})
            .run()
        return {...copied, artifacts: storeArtifacts({tx, home: input.home, runId: copied.runId, artifacts})}
      },
      {behavior: 'immediate'},
    )
  } finally {
    client.exec('DETACH DATABASE source')
    store.close()
  }
}

const SOURCE_TAR = 'source.tar'

const ImportOptionsSchema = z.object({
  screenshots: z.string().optional(),
  design: z.string().optional(),
  source: z.string().optional(),
  transcript: z.string().optional(),
  lane: z.string().optional(),
  lifetime: z.array(z.string()).default([]),
})

const LifetimeSchema = z.union([z.literal('infinite'), z.coerce.number().int().nonnegative().transform(String)])

const LifetimesSchema = z.strictObject(mapValues(designConfig.runs.lifetimes, () => LifetimeSchema))

async function widthFiles(input: {dir: string | undefined; kind: 'design' | 'screenshot'}) {
  const {dir, kind} = input
  if (dir === undefined) return []
  const names = await readdir(dir)
  return Promise.all(
    names.map(async (name) => ({
      kind,
      width: z.coerce.number().parse(parse(name).name),
      name,
      bytes: await readFile(join(dir, name)),
    })),
  )
}
