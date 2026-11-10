import {randomUUID} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {z} from 'zod'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import type {open} from './open.js'

export async function readCommands(input: {trial: Trial; commands: string[]; run: RunOptions}): Promise<void> {
  const lines = input.commands.length > 0 ? input.commands : createInterface({input: createReadStream('', {fd: STDIN})})
  for await (const line of lines) {
    const [name = '', ...args] = line.trim().split(' ').filter(Boolean)
    if (name === 'quit') return
    await runCommand({trial: input.trial, run: input.run, name, args})
  }
}

type Trial = Awaited<ReturnType<typeof open>>

type RunOptions = {wave?: string; lane?: string}

type Command = (input: {trial: Trial; run: RunOptions; args: string[]}) => Promise<void>

const RUN_COMMAND = 'design:run'

const STDIN = 0

const [getDef, checkDef, statusDef] = DESIGN_TOOLS

const VerdictSchema = z.object({verdict: z.string()})

const COMMANDS: Record<string, Command> = {
  get: ({trial, args: [file]}) => called({trial, name: getDef.name, schema: getDef.outputSchema, file}),
  check: ({trial, args: [file]}) => called({trial, name: checkDef.name, schema: checkDef.outputSchema, file}),
  status: ({trial, args: [file]}) => called({trial, name: statusDef.name, schema: statusDef.outputSchema, file}),
  run: async ({trial, run, args}) => {
    const [action = '', first = '', second] = args.join(' ') === 'end' ? ['end', ...(await closing(trial))] : args
    const options = action === 'start' ? run : costOf(second)
    const passed = action === 'start' ? [action, first, second ?? ''] : [action, first]
    print(JSON.stringify(await trial.rpc.extensions.run({name: RUN_COMMAND, args: passed, options})))
  },
  turn: async ({trial, args: [file = '']}) => {
    const runId = randomUUID()
    const response = await fetch(`${trial.apiBase}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        threadId: trial.session,
        runId,
        messages: [{id: `${runId}-user`, role: 'user', content: await readFile(resolve(file), 'utf8')}],
        tools: [],
        context: [],
      }),
      signal: AbortSignal.timeout(designConfig.runs.turnMs),
    })
    if (!response.ok) throw new Error(`the engine refused the turn: ${response.status} ${await response.text()}`)
    await response.text()
    const {usage} = await trial.rpc.sessions.get({sessionId: trial.session})
    print(`turn ended cost ${usage?.totalCostUsd ?? 'none'}`)
  },
  screenshot: async ({trial, args: [file = 'trial.png']}) => {
    await trial.page.screenshot({path: resolve(file), fullPage: true})
    print(`wrote ${resolve(file)}`)
  },
}

async function runCommand(input: {trial: Trial; run: RunOptions; name: string; args: string[]}): Promise<void> {
  const command = COMMANDS[input.name]
  if (command === undefined)
    return print(`unknown command ${input.name}; one of ${Object.keys(COMMANDS).join(', ')}, quit`)
  await command({trial: input.trial, run: input.run, args: input.args}).catch((error: unknown) =>
    print(`${input.name} failed: ${String(error)}`),
  )
}

async function called<Schema extends z.ZodType>(input: {
  trial: Trial
  name: string
  schema: Schema | undefined
  file: string | undefined
}): Promise<void> {
  if (input.schema === undefined) throw new Error('the design tool declares no output schema')
  const output = input.schema.parse(await input.trial.rpc.registry.call({name: input.name, input: {}}))
  const text = JSON.stringify(output)
  if (input.file === undefined) return print(text)
  await writeFile(resolve(input.file), text)
  print(`wrote ${resolve(input.file)}`)
}

async function closing(trial: Trial): Promise<string[]> {
  const {verdict} = VerdictSchema.parse(await trial.rpc.registry.call({name: statusDef.name, input: {}}))
  const {usage} = await trial.rpc.sessions.get({sessionId: trial.session})
  const said = verdict.replaceAll(' ', '-')
  return usage?.totalCostUsd === undefined ? [said] : [said, String(usage.totalCostUsd)]
}

function costOf(second: string | undefined): {cost?: number} {
  if (second === undefined) return {}
  return {cost: Number(second)}
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
