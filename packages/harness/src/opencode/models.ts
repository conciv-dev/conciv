import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {z} from 'zod'
import type {HarnessModel} from '@conciv/protocol/harness-types'

const run = promisify(execFile)

const LISTING_TIMEOUT_MS = 30_000

const LISTING_BUFFER_BYTES = 64 * 1024 * 1024

const MODEL_BLOCK = /^\{\n[\s\S]*?\n\}$/gm

const ListedModelSchema = z
  .object({
    id: z.string(),
    providerID: z.string(),
    name: z.string(),
    release_date: z.string().optional(),
    status: z.string().optional(),
  })
  .loose()

type ListedModel = z.infer<typeof ListedModelSchema>

function parsedBlock(block: string): ListedModel[] {
  try {
    const parsed = ListedModelSchema.safeParse(JSON.parse(block))
    return parsed.success ? [parsed.data] : []
  } catch {
    return []
  }
}

function newestFirst(left: ListedModel, right: ListedModel): number {
  return (right.release_date ?? '').localeCompare(left.release_date ?? '')
}

export async function opencodeModels(): Promise<HarnessModel[]> {
  const {stdout} = await run('opencode', ['models', '--verbose'], {
    timeout: LISTING_TIMEOUT_MS,
    maxBuffer: LISTING_BUFFER_BYTES,
  })
  const listed = (stdout.match(MODEL_BLOCK) ?? [])
    .flatMap(parsedBlock)
    .filter((model) => model.status !== 'deprecated')
    .toSorted(newestFirst)
  const byName = Object.groupBy(listed, (model) => model.name)
  return listed.map((model) => ({
    id: `${model.providerID}/${model.id}`,
    name: (byName[model.name]?.length ?? 0) > 1 ? `${model.name} · ${model.providerID}` : model.name,
    description: model.providerID,
    group: 'OpenCode',
  }))
}
