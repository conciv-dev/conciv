import {defineCommand, type SubCommandsDef} from 'citty'
import {PageRunInputSchema} from '@conciv/protocol/page-types'
import {BUILTIN_PAGE_TOOLS, pageVerbOfTool} from '@conciv/tools/builtins'
import {runRpc} from './request.js'
import {toolCommand, type ToolDeclaration} from './tool-command.js'

const REACT_CATEGORY = 'react'

function verbCommands(tools: readonly ToolDeclaration[]): SubCommandsDef {
  return Object.fromEntries(
    tools.map((tool) => {
      const verb = pageVerbOfTool(tool.name)
      return [
        verb,
        toolCommand(tool, {
          name: verb,
          positional: 'selector',
          run: (input) => runRpc((rpc) => rpc.page.run(PageRunInputSchema.parse({verb, ...input}))),
        }),
      ]
    }),
  )
}

const changesCommand = defineCommand({
  meta: {name: 'changes', description: 'list (or --clear) the live-edit journal'},
  args: {clear: {type: 'boolean', description: 'reset the journal after listing'}},
  run: ({args}) => runRpc((rpc) => (args.clear ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
})

export const pageCommand = defineCommand({
  meta: {name: 'page', description: 'read & drive the live page (snapshot, click, fill, edit, eval, …)'},
  subCommands: {...verbCommands(BUILTIN_PAGE_TOOLS), changes: changesCommand},
})

export const reactCommand = defineCommand({
  meta: {name: 'react', description: 'inspect & edit live React components (inspect, tree, find, override, track)'},
  subCommands: verbCommands(BUILTIN_PAGE_TOOLS.filter((tool) => tool.meta?.category === REACT_CATEGORY)),
})
