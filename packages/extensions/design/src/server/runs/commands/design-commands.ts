import type {ExtensionCliCommands} from '@conciv/extension'
import {runsGc} from './runs-gc.js'
import {report} from './report.js'

export const DESIGN_COMMANDS: ExtensionCliCommands = {
  'runs-gc': {
    description: 'delete the expired artifacts of the runs store and print each file removed',
    positionals: [],
    scope: 'home',
    run: ({home}) => runsGc({home}),
  },
  report: {
    description: 'render wave_summary and judged of a wave to <home>/artifacts/reports/<wave>.md: report <wave>',
    positionals: ['wave'],
    scope: 'home',
    run: ({args: [wave], db, home}) => {
      if (wave === undefined) throw new Error('report takes the wave')
      return report({db, home, wave})
    },
  },
}
