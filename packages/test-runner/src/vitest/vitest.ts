import type {RunArgs} from '@opendui/aidx-protocol/runner-types'
import {defineChildRunner} from '../driver.js'

// The vitest adapter: supplies the child script URL + native arg mapping (mirrors the old
// inline manager's run/list arg builders). All spawn/read/cache lives in the shared driver.
// Capabilities mirror the on-demand model: no persistent watch, no @vitest/ui server,
// name-filter + failed-only flags accepted (failedOnly is a documented no-op on a fresh child).
// Authored through defineChildRunner so the contract is inferred + dev-validated, never bare.
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
