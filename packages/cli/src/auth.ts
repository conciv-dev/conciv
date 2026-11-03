import {defineCommand} from 'citty'
import {readTrustedBrowsers, revokeBrowsers} from '@conciv/protocol/engine-trust'
import type {CliOutcome} from './envelope.js'
import {discoveredEngine} from './engine-origin.js'
import {userFailure} from './failure.js'

export type RevokeOptions = {id?: string; all: boolean; cwd: string}

export function runRevoke(options: RevokeOptions): CliOutcome {
  const engine = discoveredEngine(options.cwd)
  if (engine === undefined) {
    throw userFailure('no conciv engine state found here or in any parent directory', {
      hint: 'run this inside a project that has run the conciv dev server (it writes .conciv/server.json)',
    })
  }
  if (options.all) return {report: 'json', data: {revoked: revokeBrowsers(engine.stateDir, 'all'), trusted: []}}
  if (options.id === undefined)
    return {report: 'json', data: {revoked: [], trusted: readTrustedBrowsers(engine.stateDir)}}
  const revoked = revokeBrowsers(engine.stateDir, {id: options.id})
  if (revoked.length === 0) {
    throw userFailure(`no trusted browser has the id "${options.id}"`, {
      hint: 'run `conciv auth revoke` without an id to list the trusted browsers',
    })
  }
  return {report: 'json', data: {revoked, trusted: readTrustedBrowsers(engine.stateDir)}}
}

const revokeCommand = defineCommand({
  meta: {name: 'revoke', description: 'Stop trusting a browser that logged in to the conciv engine.'},
  args: {
    id: {type: 'positional', required: false, description: 'the browser id to revoke; omit it to list them'},
    all: {type: 'boolean', default: false, description: 'revoke every trusted browser'},
  },
  run: ({args}) => runRevoke({id: args.id, all: args.all, cwd: process.cwd()}),
})

export const authCommand = defineCommand({
  meta: {name: 'auth', description: 'Manage the browsers trusted by the conciv engine.'},
  subCommands: {revoke: revokeCommand},
})
