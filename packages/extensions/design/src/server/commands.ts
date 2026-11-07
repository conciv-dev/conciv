import type {ExtensionCommands} from '@conciv/extension'
import {createRuns} from './runs.js'
import type {designTables} from './tables.js'

export const DESIGN_COMMANDS: ExtensionCommands<ReturnType<typeof designTables>> = {
  query: {
    description: 'run one read-only SELECT over the design tables, as design_query does',
    positionals: ['sql'],
    run: ({args: [sql = ''], db}) => db.query(sql),
  },
  runs: {
    description: 'record a harness run: runs start <model> <prompt head file> | runs end <verdict> <cost>',
    positionals: ['action', 'first', 'second'],
    run: ({args: [action, first = '', second = ''], db}) => {
      const runs = createRuns(db)
      if (action === 'start') return runs.start({model: first, promptHead: second})
      if (action === 'end') return runs.end({verdict: first, cost: second === '' ? null : Number(second)})
      throw new Error(`runs takes start or end, not ${action ?? 'nothing'}`)
    },
  },
}
