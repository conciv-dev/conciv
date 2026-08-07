import {runCommand, showUsage, type CommandDef} from 'citty'
import {argsOf, argumentProblem, commandProblem, resolveLeaf} from './arguments.js'
import {failureOf} from './failure.js'
import {outcomeOf, writeFailure, writeOutcome, type CliOutcome} from './envelope.js'

const HELP_FLAGS = new Set(['--help', '-h'])

export async function runCli(root: CommandDef, rawArgs: string[]): Promise<number> {
  try {
    const resolved = await resolveLeaf(root, rawArgs)
    if (rawArgs.some((token) => HELP_FLAGS.has(token))) {
      await showUsage(resolved.command, resolved.parent)
      return 0
    }
    if (resolved.kind !== 'leaf') return writeFailure(commandProblem(resolved))
    const problem = argumentProblem(resolved.rest, await argsOf(resolved.command), resolved.label)
    if (problem !== null) return writeFailure(problem)
    return await writeOutcome(leafOutcome(resolved.command, resolved.rest))
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}

async function leafOutcome(command: CommandDef, rest: string[]): Promise<CliOutcome> {
  const {result} = await runCommand(command, {rawArgs: rest})
  return outcomeOf(result)
}
