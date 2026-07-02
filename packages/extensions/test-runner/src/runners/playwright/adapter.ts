import type {RunArgs} from '../../runner/contract.js'
import {defineChildRunner} from '../../runner/driver.js'

export const playwright = defineChildRunner({
  id: 'playwright',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  childUrl: new URL('./child.js', import.meta.url),
  buildRunArgs: (args: RunArgs, cwd: string) => {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs]
  },
  buildListArgs: (_failedOnly: boolean, cwd: string) => ['--mode', 'list', '--cwd', cwd],
})
