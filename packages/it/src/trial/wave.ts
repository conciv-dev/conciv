import {spawn} from 'node:child_process'
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'
import {lane} from './lane.js'

export async function wave(argv: string[]): Promise<void> {
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      runs: {type: 'string', default: '1'},
      model: {type: 'string'},
      design: {type: 'string', multiple: true, default: []},
      trial: {type: 'string'},
      'lane-root': {type: 'string', default: FIXTURES_ROOT},
      route: {type: 'string'},
      agent: {type: 'boolean', default: true},
    },
  })
  const [name] = positionals
  const {model} = values
  if (name === undefined) throw new Error('trial wave takes the wave name')
  if (model === undefined) throw new Error('trial wave takes --model <model>')
  if (values.trial === undefined)
    throw new Error('trial wave takes --trial <dir> holding src, assets, prompt.md, head.txt')
  const designs = values.design.flatMap((ref) => {
    const at = ref.indexOf(':')
    return [`--${DesignKindSchema.parse(ref.slice(0, at))}`, ref.slice(at + 1)]
  })
  const shared = [
    '--wave',
    name,
    ...designs,
    ...(values.agent ? ['--agent', '--model', model] : []),
    ...(values.route === undefined ? [] : ['--route', values.route]),
  ]
  const trial = resolve(values.trial)
  const root = resolve(values['lane-root'])
  const labels = Array.from({length: Number(values.runs)}, (_, index) => `lane-${index + 1}`)
  await Promise.all(labels.map((label) => driven({trial, root, wave: name, label, model, agent: values.agent, shared})))
}

const FIXTURES_ROOT = fileURLToPath(new URL('../../test/fixtures/', import.meta.url))

const BIN = fileURLToPath(new URL('trial.ts', import.meta.url))

const SRC_MARK = '{{SRC}}'

const DesignKindSchema = z.enum(['figma', 'image', 'document'])

async function driven(input: {
  trial: string
  root: string
  wave: string
  label: string
  model: string
  agent: boolean
  shared: string[]
}): Promise<void> {
  const {trial, label} = input
  const dir = await lane({root: input.root, wave: input.wave, label})
  await Promise.all([rm(join(dir, 'src'), {recursive: true}), rm(join(dir, 'public', 'design'), {recursive: true})])
  await Promise.all([
    cp(join(trial, 'src'), join(dir, 'src'), {recursive: true}),
    cp(join(trial, 'assets'), join(concivStateDir(dir), 'design', 'assets'), {recursive: true}),
  ])
  const temp = await mkdtemp(join(tmpdir(), 'conciv-trial-lane-'))
  try {
    const prompt = join(temp, 'prompt.md')
    await writeFile(prompt, (await readFile(join(trial, 'prompt.md'), 'utf8')).replaceAll(SRC_MARK, join(dir, 'src')))
    const commands = [
      `run start ${input.model} ${join(trial, 'head.txt')}`,
      ...(input.agent ? [`turn ${prompt}`] : []),
      'run end',
    ]
    const child = spawn(
      process.execPath,
      [...process.execArgv, BIN, 'serve', '--project', dir, '--lane', label, ...input.shared, ...commands],
      {stdio: ['ignore', 'pipe', 'inherit']},
    )
    if (child.stdout === null) throw new Error(`lane ${label} has no stdout`)
    for await (const line of createInterface({input: child.stdout})) process.stdout.write(`${label} ${line}\n`)
  } finally {
    await rm(temp, {recursive: true, force: true})
  }
}
