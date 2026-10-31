import {defineCommand, type CommandDef} from 'citty'
import {PAGE_TOOL_DEFS, PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {runRpc} from './request.js'
import {groupHelpNote, toolGroupCommand} from './tool-group.js'

const REACT_CATEGORY = 'react'

const changesCommand = defineCommand({
  meta: {name: 'changes', description: 'list (or --clear) the live-edit journal'},
  args: {clear: {type: 'boolean', description: 'reset the journal after listing'}},
  run: ({args}) => runRpc((rpc) => (args.clear ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
})

export const pageCommand = toolGroupCommand({
  prefix: PAGE_TOOL_PREFIX,
  name: 'page',
  description: 'read & drive the live page; run --help for every capability',
  builtIns: PAGE_TOOL_DEFS,
  extra: {changes: changesCommand},
})

export const reactCommand = toolGroupCommand({
  prefix: PAGE_TOOL_PREFIX,
  name: 'react',
  description: 'inspect & edit live React components; run --help for every capability',
  builtIns: PAGE_TOOL_DEFS,
  filter: (signature) => signature.category === REACT_CATEGORY,
})

export function pageHelpNote(commands: readonly (CommandDef | undefined)[]): Promise<string | null> {
  return groupHelpNote({commands, groups: {page: pageCommand, react: reactCommand}})
}
