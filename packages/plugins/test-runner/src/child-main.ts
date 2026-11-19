import {writeSync} from 'node:fs'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import {Effect} from 'effect'
import type {ChildMessage} from './child-protocol.js'

export type ChildArgs = {
  readonly mode: string
  readonly cwd: string
  readonly patterns: readonly string[]
  readonly name: string | undefined
  readonly failedOnly: boolean
}

export function sendChildMessage(message: ChildMessage): void {
  writeSync(3, `${JSON.stringify(message)}\n`)
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function flagValues(argv: readonly string[], name: string): string[] {
  return argv.flatMap((flag, index) => {
    const value = argv[index + 1]
    return flag === name && value !== undefined ? [value] : []
  })
}

function readChildArgs(argv: readonly string[]): ChildArgs {
  return {
    mode: flagValue(argv, '--mode') ?? 'run',
    cwd: flagValue(argv, '--cwd') ?? process.cwd(),
    patterns: flagValues(argv, '--pattern'),
    name: flagValue(argv, '--name'),
    failedOnly: argv.includes('--failed'),
  }
}

export function runChildMain<E extends {readonly message: string}>(
  program: (args: ChildArgs) => Effect.Effect<void, E, NodeServices.NodeServices>,
): void {
  const main = program(readChildArgs(process.argv.slice(2))).pipe(
    Effect.tapError((error) => Effect.sync(() => sendChildMessage({type: 'error', reason: error.message}))),
    Effect.provide(NodeServices.layer),
  )
  NodeRuntime.runMain(main, {disableErrorReporting: true})
}
