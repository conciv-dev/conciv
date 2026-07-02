import {defineTool} from '@conciv/extension'
import type {TestRunnerManager} from '../runner/contract.js'
import {testToolDef, TestInput} from './def.js'

export const testTool = defineTool<typeof TestInput, {manager: TestRunnerManager}>(testToolDef).server(
  ({action, pattern}, ctx) => {
    if (action === 'list') return ctx.manager.list()
    if (action === 'run') return ctx.manager.run({patterns: pattern ? [pattern] : undefined})
    return ctx.manager.status()
  },
)
