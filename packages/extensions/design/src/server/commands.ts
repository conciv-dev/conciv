import type {ExtensionCliCommands} from '@conciv/extension'
import {createRuns} from './runs.js'
import {importRun} from './import-run.js'
import {openRunsStore} from './runs-store.js'
import type {designTables} from './tables.js'

export const DESIGN_COMMANDS: ExtensionCliCommands<ReturnType<typeof designTables>> = {
  runs: {
    description:
      'record a harness run: runs start <model> <prompt head file> | runs end <verdict> <cost> | runs import <state dir>',
    positionals: ['action', 'first', 'second'],
    run: ({args: [action, first = '', second = ''], db, home}) => {
      const runs = createRuns(db)
      if (action === 'start') return runs.start({model: first, promptHead: second})
      if (action === 'end') return runs.end({verdict: first, cost: second === '' ? null : Number(second)})
      if (action === 'import') return imported({home, stateDir: first})
      throw new Error(`runs takes start, end or import, not ${action ?? 'nothing'}`)
    },
  },
}

function imported(input: {home: string; stateDir: string}) {
  const runsStore = openRunsStore(input.home)
  try {
    return importRun({runsStore, stateDir: input.stateDir})
  } finally {
    runsStore.close()
  }
}
