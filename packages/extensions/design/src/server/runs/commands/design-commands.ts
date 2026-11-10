import type {ExtensionCliCommands} from '@conciv/extension'
import {runsGc} from './runs-gc.js'
import {report} from './report.js'
import {judge} from './judge.js'
import {designConfig} from '../../../shared/tolerances.js'

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
  judge: {
    description:
      'score each run and width of a wave without a judgement by the judge model, from its design and screenshot: judge <wave>',
    positionals: ['wave'],
    options: {'judge-model': {type: 'string', description: 'the model that judges'}},
    scope: 'home',
    run: ({args: [wave], options, db, home}) => {
      if (wave === undefined) throw new Error('judge takes the wave')
      const judgeModel = options['judge-model']
      return judge({
        db,
        home,
        wave,
        judgeModel: typeof judgeModel === 'string' ? judgeModel : designConfig.runs.judgeModel,
      })
    },
  },
}
