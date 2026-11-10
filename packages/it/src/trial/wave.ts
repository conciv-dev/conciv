import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {z} from 'zod'
import {lane} from './lane.js'

export async function wave(argv: string[]): Promise<void> {
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      runs: {type: 'string', default: '1'},
      model: {type: 'string'},
      design: {type: 'string', multiple: true, default: []},
      'lane-root': {type: 'string', default: FIXTURES_ROOT},
      route: {type: 'string'},
    },
  })
  const [name] = positionals
  if (name === undefined) throw new Error('trial wave takes the wave name')
  const designs = values.design.flatMap((ref) => {
    const at = ref.indexOf(':')
    return [`--${DesignKindSchema.parse(ref.slice(0, at))}`, ref.slice(at + 1)]
  })
  const shared = [
    '--agent',
    '--wave',
    name,
    ...designs,
    ...(values.model === undefined ? [] : ['--model', values.model]),
    ...(values.route === undefined ? [] : ['--route', values.route]),
  ]
  const labels = Array.from({length: Number(values.runs)}, (_, index) => `lane-${index + 1}`)
  const dirs = await Promise.all(labels.map((label) => lane({root: resolve(values['lane-root']), wave: name, label})))
  const children = labels.map((label, index) =>
    spawn(
      process.execPath,
      [...process.execArgv, BIN, 'serve', '--project', dirs[index] ?? '', '--lane', label, ...shared],
      {stdio: ['pipe', 'pipe', 'inherit']},
    ),
  )
  createInterface({input: process.stdin}).on('line', (line) =>
    children.forEach((child) => child.stdin?.write(`${line}\n`)),
  )
  process.stdin.on('end', () => children.forEach((child) => child.stdin?.end()))
  const ids = await Promise.all(children.map((child, index) => storeRun({child, label: labels[index] ?? ''})))
  process.stdout.write(`${ids.filter((id) => id !== null).join(' ')}\n`)
  process.stdin.destroy()
}

const FIXTURES_ROOT = fileURLToPath(new URL('../../test/fixtures/', import.meta.url))

const BIN = fileURLToPath(new URL('trial.ts', import.meta.url))

const STORE_RUN = 'store run '

const DesignKindSchema = z.enum(['figma', 'image', 'document'])

async function storeRun(input: {child: ReturnType<typeof spawn>; label: string}): Promise<string | null> {
  const {child, label} = input
  const found: string[] = []
  const stdout = child.stdout
  if (stdout === null) return null
  for await (const line of createInterface({input: stdout})) {
    process.stdout.write(`${label} ${line}\n`)
    if (line.startsWith(STORE_RUN)) found.push(line.slice(STORE_RUN.length))
  }
  return found.at(-1) ?? null
}
