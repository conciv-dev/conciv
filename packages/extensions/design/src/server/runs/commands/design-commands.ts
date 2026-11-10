import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {z} from 'zod'
import type {ExtensionCliCommands} from '@conciv/extension'
import type {designTables} from '../../tables.js'
import {runStart} from './run-start.js'
import {runEnd} from './run-end.js'
import {runImport} from './run-import.js'

export const DESIGN_COMMANDS: ExtensionCliCommands<ReturnType<typeof designTables>> = {
  run: {
    description: 'record a harness run: run start <model> <prompt head> [--wave --lane] | run end <verdict> [--cost]',
    positionals: ['action', 'first', 'second'],
    options: {
      wave: {type: 'string', description: 'the wave this run belongs to'},
      lane: {type: 'string', description: 'the lane label inside the wave'},
      cost: {type: 'number', description: 'what the run cost'},
    },
    scope: 'project',
    run: ({args: [action, first = '', second = ''], options, db, cwd}) => {
      const {wave, lane, cost} = RunOptionsSchema.parse(options)
      if (action === 'start') return runStart({db, cwd, extensionDir, model: first, promptHead: second, wave, lane})
      if (action === 'end') return runEnd({db, verdict: first, cost})
      throw new Error(`run takes start or end, not ${action ?? 'nothing'}`)
    },
  },
  'run-import': {
    description:
      'copy a project run into the runs store once: run-import <project dir> [--screenshots --design --source --transcript --lane --lifetime kind=days]',
    positionals: ['project'],
    options: {
      screenshots: {
        type: 'string',
        description: 'a folder of the final screenshots, one <width>.png per measured width',
      },
      design: {type: 'string', description: 'a folder of the design renders, one <width>.png per measured width'},
      source: {type: 'string', description: 'the final source folder, stored as one tar'},
      transcript: {type: 'string', description: 'the agent transcript file'},
      lane: {type: 'string', description: 'the lane folder runs gc --state may delete'},
      lifetime: {type: 'string', multiple: true, description: 'kind=days over the configured lifetime of a kind'},
    },
    scope: 'home',
    run: ({args: [project], options, home}) => {
      if (project === undefined) throw new Error('run-import takes the project dir')
      return runImport({home, dir: project, options})
    },
  },
}

const extensionDir = dirname(createRequire(import.meta.url).resolve('@conciv/extension-design/package.json'))

const RunOptionsSchema = z.object({
  wave: z.string().nullable().default(null),
  lane: z.string().nullable().default(null),
  cost: z.number().nullable().default(null),
})
