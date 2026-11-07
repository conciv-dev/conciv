import {parse, printHelp, printVersion} from '@bomb.sh/router'
import {z} from 'zod'
import {routeFailure} from './arguments.js'
import {writeFailure, writeOutcome} from './envelope.js'
import {failureOf, type EnvelopeError} from './failure.js'
import {extensionCatalog} from './extension-commands.js'
import {handlerOf} from './router/handler.js'
import type {main} from './main.js'
import {liveCatalog, type LiveCatalog} from './tool-group.js'

const ModelSchema = z.record(z.string(), z.unknown())

type Parsed = ReturnType<typeof parse<typeof main>>

type Paused<Step> = Extract<Step, {resume: unknown}>

type Extended = ReturnType<Paused<Parsed>['resume']>

type Final = Exclude<Parsed | Extended, {resume: unknown}> | ReturnType<Paused<Extended>['resume']>

type Settled = {result: Final; offline: string[]; unreadable: EnvelopeError | null}

export async function runCli(app: typeof main, argv: string[]): Promise<number> {
  try {
    const {result, offline, unreadable} = await settle(parse(app, {argv}))
    if (!result.ok) return writeFailure(rootUnreadable({result, unreadable}) ?? routeFailure(result))
    if (result.method === 'help') return printHelpOf(result, offline)
    if (result.method === 'version') {
      console.log(printVersion(result))
      return 0
    }
    const run = handlerOf(result.definition)
    if (run === null) throw new Error(`the route ${result.route} has no handler`)
    const model = ModelSchema.parse(result.model)
    return await writeOutcome(Promise.resolve().then(() => run(model)))
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}

async function settle(parsed: Parsed): Promise<Settled> {
  if (!('resume' in parsed)) return {result: parsed, offline: [], unreadable: null}
  const {unreadable, ...catalog} = extensionCatalog()
  const extended = parsed.resume(catalog)
  if (!('resume' in extended)) return {result: extended, offline: [], unreadable}
  const live: LiveCatalog = await liveCatalog()
  const noun = extended.route.split('/').at(-1) ?? extended.route
  return {result: extended.resume(live), offline: live === null ? [noun] : [], unreadable}
}

function rootUnreadable(input: {
  result: {path: readonly unknown[]}
  unreadable: EnvelopeError | null
}): EnvelopeError | null {
  return input.result.path.length === 0 ? input.unreadable : null
}

function printHelpOf(result: Parameters<typeof printHelp>[0], offline: string[]): number {
  console.log(printHelp(result))
  for (const noun of offline) {
    console.log(`offline: showing the built-in ${noun} capabilities; a running server may add more`)
  }
  return 0
}
