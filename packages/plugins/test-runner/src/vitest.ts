export * as VitestAdapter from './vitest.js'
import type {RunArgs} from './runner.js'
import {defineChildRunner} from './run.js'

export const vitest = defineChildRunner({
  id: 'vitest',
  childUrl: new URL('./vitest-child.js', import.meta.url),
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
