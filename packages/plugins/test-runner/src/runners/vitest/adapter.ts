import type {RunArgs} from '../../runner/contract.js'
import {defineChildRunner} from '../../runner/driver.js'

export const vitest = defineChildRunner({
  id: 'vitest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  childUrl: new URL('./child.js', import.meta.url),
  buildRunArgs: (args: RunArgs, cwd: string) => {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    const failedArgs = args.failedOnly ? ['--failed'] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs, ...failedArgs]
  },
  buildListArgs: (failedOnly: boolean, cwd: string) => [
    '--mode',
    'list',
    '--cwd',
    cwd,
    ...(failedOnly ? ['--failed'] : []),
  ],
})
