import {defineTool} from '@conciv/extension'
import type {TestRunnerManager} from '../runner/contract.js'
import {testToolDef} from './def.js'

export const testTool = defineTool(testToolDef).server(({action, pattern}, ctx: {manager: TestRunnerManager}) => {
  if (action === 'list') return ctx.manager.list()
  if (action === 'run') return ctx.manager.run({patterns: pattern ? [pattern] : undefined})
  return ctx.manager.status()
})
