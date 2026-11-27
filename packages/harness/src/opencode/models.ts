import {spawn, type ChildProcess} from 'node:child_process'
import {once} from 'node:events'
import type {Readable} from 'node:stream'
import {z} from 'zod'
import {killLeftovers} from '../local-sandbox.js'
import type {HarnessModel} from '@conciv/types/harness-types'
import {harnessErrors} from '../_shared/errors.js'

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

const REGION_ROUTE = /^(global|us|us-gov|eu|apac|au|jp|ca|in)\./

function newestFirst(left: ListedModel, right: ListedModel): number {
  return (right.release_date ?? '').localeCompare(left.release_date ?? '')
}

function routeKey(model: ListedModel): string {
  return `${model.providerID}/${model.id.replace(REGION_ROUTE, '')}`
}

function oneRoute(routes: ListedModel[]): ListedModel[] {
  const unrouted = routes.find((route) => !REGION_ROUTE.test(route.id))
  const chosen = routes.find((route) => route.id.startsWith('global.')) ?? unrouted ?? routes[0]
  return chosen ? [{...chosen, name: unrouted?.name ?? chosen.name}] : []
}

function distinctModels(listed: ListedModel[]): ListedModel[] {
  const routed = Object.values(Object.groupBy(listed, routeKey)).flatMap((routes) => oneRoute(routes ?? []))
  return Object.values(Object.groupBy(routed, (model) => `${model.providerID}/${model.name}`)).flatMap(
    (same) => same?.slice(0, 1) ?? [],
  )
}

const GoneSchema = z.object({code: z.literal('ESRCH')})

function signalGroup(group: number, groupSignal: NodeJS.Signals): void {
  try {
    process.kill(-group, groupSignal)
  } catch (error) {
    if (!GoneSchema.safeParse(error).success) throw error
  }
}

function exited(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once('exit', () => resolve()))
}

async function endGroup(child: ChildProcess): Promise<void> {
  const group = child.pid
  if (group === undefined) return
  signalGroup(group, 'SIGTERM')
  await killLeftovers({pid: group, kill: (groupSignal) => signalGroup(group, groupSignal)})
  await exited(child)
}

async function readCapped(stream: Readable): Promise<string> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) continue
    size += chunk.byteLength
    if (size > LISTING_BUFFER_BYTES) {
      throw new RangeError(`opencode models printed more than ${LISTING_BUFFER_BYTES} bytes`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function listingOutput(signal: AbortSignal): Promise<string> {
  const child = spawn('opencode', ['models', '--verbose'], {detached: true})
  try {
    const [stdout, stderr] = await Promise.all([
      readCapped(child.stdout),
      readCapped(child.stderr),
      once(child, 'close', {signal: AbortSignal.any([signal, AbortSignal.timeout(LISTING_TIMEOUT_MS)])}),
    ])
    if (child.exitCode !== 0) {
      throw harnessErrors.OPENCODE_MODELS_FAILED({
        exit: String(child.exitCode ?? child.signalCode),
        stderr: stderr.trim(),
      })
    }
    return stdout
  } finally {
    await endGroup(child)
  }
}

export async function opencodeModels({signal}: {signal: AbortSignal}): Promise<HarnessModel[]> {
  const stdout = await listingOutput(signal)
  const listed = distinctModels(
    (stdout.match(MODEL_BLOCK) ?? [])
      .flatMap(parsedBlock)
      .filter((model) => model.status !== 'deprecated')
      .toSorted(newestFirst),
  )
  const byName = Object.groupBy(listed, (model) => model.name)
  return listed.map((model) => ({
    id: `${model.providerID}/${model.id}`,
    name: (byName[model.name]?.length ?? 0) > 1 ? `${model.name} · ${model.providerID}` : model.name,
    description: model.providerID,
    group: 'OpenCode',
  }))
}
